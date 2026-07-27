/* ══════════════════════════════════════════════════════════════════════════
   ALIQUOT — ENTITLEMENT & BILLING                     src/pay/entitlement.js

   Replaces the Razorpay path for Play-Store distribution. Razorpay survives,
   gated behind DISTRIBUTION === "direct", because it is the correct provider
   for a direct-APK or web build and the wrong one inside a Play app.

   ── WHY THIS FILE EXISTS (build-state open items 1, 2 and 3) ────────────
   1. Google Play's Payments policy requires Google Play's billing system for
      any purchase of digital content inside an app distributed on Play.
      Razorpay for a feature unlock in a Play build is a policy violation and
      the enforcement outcome is app removal, not a warning.
   2. Amount-only Razorpay checkout takes the price from the device. A patched
      APK pays ₹1 and unlocks Pro.
   3. The licence record was device-local and editable in plain storage.

   Play Billing closes all three: the price comes from Play Console, the
   purchase is a signed token issued by Google, and the entitlement follows
   the user's Google account rather than the device.

   ── OFFLINE-FIRST IS PRESERVED ──────────────────────────────────────────
   No calculation in this app touches the network and that does not change.
   Only two moments need connectivity:
       · the first purchase, and
       · the first entitlement sync after install or after a Play account
         change.
   After that, the Play Store app maintains a local purchase cache and
   queryPurchases resolves from it with no network. The cache is the reason
   an entitlement check is not an online dependency. VERIFY this behaviour
   on a real device with aeroplane mode on before release — it is the single
   assumption this design rests on.

   ── ACKNOWLEDGEMENT IS NOT OPTIONAL ─────────────────────────────────────
   A one-time purchase that is not acknowledged within three days is
   automatically refunded by Google and the user loses the entitlement they
   paid for. acknowledge() below is called on every unacknowledged purchase
   found at every sync, not only at the moment of purchase, because the app
   may be killed between purchase and acknowledgement.

   ── DO NOT CONSUME ──────────────────────────────────────────────────────
   The Pro unlock is a non-consumable one-time product. consumeAsync() would
   make it repurchasable and would destroy the entitlement. It is never
   called here and there is no code path that can reach it.

   Personal project. No CPCB, MoEFCC or BIS endorsement is claimed or implied.
   ══════════════════════════════════════════════════════════════════════════ */

import { PRO_MODULES, PREVIEW, DISTRIBUTION, BILLING } from "../config.js";
import { store } from "../lib/store.js";

/* ─────────────────────────────────────────────────────────────────────────
   CONFIG CONTRACT — what src/config.js must now export

     DISTRIBUTION  "play" | "direct" | "preview"
                   Set from an env var at build time, NOT at runtime. A
                   runtime switch is a switch an attacker can flip.
                     VITE_ALIQUOT_DIST=play   npm run build   → Play AAB
                     VITE_ALIQUOT_DIST=direct npm run build   → direct APK
     BILLING = {
       productId:   "aliquot_pro_unlock",   // Play Console product id
       publicKey:   "",                     // Play Console → Monetization
                                            // setup → Licensing. Base64 RSA.
                                            // Empty = signature check skipped
                                            // and the app SAYS SO.
       verifyUrl:   "",                     // optional server-side check
     }
   ───────────────────────────────────────────────────────────────────────── */

const KEY = "aliquot.entitlement.v2";

/* The shape held on device. It is a CACHE, not the source of truth.
   Play's purchase cache is the source of truth on a Play build. */
const EMPTY = Object.freeze({
  pro: false,
  source: "none",        // "play" | "razorpay" | "preview" | "none"
  productId: null,
  orderId: null,         // Play order id, for support requests
  purchaseTimeMs: null,
  acknowledged: false,
  signatureChecked: false,
  syncedAtMs: null,
  account: null,         // obfuscated account id, never the email
});

/* ═════════════════════════════════════════════════════════════════════════
   PROVIDER INTERFACE
   Every provider implements: sync(), purchase(), and describe().
   sync() must be safe to call on every app resume and must never throw.
   ═════════════════════════════════════════════════════════════════════════ */

/* ── Play Billing ────────────────────────────────────────────────────────
   Requires a native bridge exposing the four calls below. Two routes:

     (a) A community Capacitor/Cordova in-app-purchase plugin. Workable and
         much less code. VERIFY the plugin is currently maintained and that
         it targets a Play Billing Library version Google still accepts —
         Google retires Billing Library versions on a schedule and an app
         built against a retired version cannot be updated on Play.

     (b) A ~200-line Kotlin Capacitor plugin wrapping BillingClient. More
         code, no third-party dependency, no risk of the plugin going
         unmaintained ahead of a Billing Library deadline.

   Take (b) if this app is going to be maintained for years. The surface is
   small and the deadline risk in (a) is the kind that surfaces as "you
   cannot ship a security fix" at the worst moment.

   NATIVE CONTRACT — the bridge must expose:
     init()               → { ok, reason? }
     queryPurchases()     → { purchases: [{ productId, purchaseToken,
                              orderId, purchaseTime, acknowledged,
                              purchaseState, originalJson, signature }] }
     launchPurchaseFlow(productId, obfuscatedAccountId)
                          → { code, purchase? }   code: "ok" | "cancelled"
                                                  | "already_owned" | "error"
     acknowledge(purchaseToken) → { ok }
   ──────────────────────────────────────────────────────────────────────── */
const PlayBillingProvider = {
  id: "play",
  describe: () => "Google Play Billing — one-time unlock, tied to your Google account",

  async sync() {
    const B = globalThis.AliquotBilling;
    if (!B) return { ok: false, reason: "billing_bridge_missing", ent: EMPTY };

    try {
      const init = await B.init();
      if (!init?.ok) return { ok: false, reason: init?.reason || "billing_unavailable", ent: EMPTY };

      const { purchases = [] } = await B.queryPurchases();
      const p = purchases.find(
        (x) => x.productId === BILLING.productId && x.purchaseState === 1 /* PURCHASED */
      );
      if (!p) return { ok: true, ent: { ...EMPTY, source: "play", syncedAtMs: Date.now() } };

      /* Acknowledge on every sync, not only on purchase. If the app was
         killed between the two, this is the only thing that stops Google
         auto-refunding a purchase the user made and expects to keep. */
      let acknowledged = Boolean(p.acknowledged);
      if (!acknowledged) {
        const a = await B.acknowledge(p.purchaseToken);
        acknowledged = Boolean(a?.ok);
      }

      const signatureChecked = await verifySignature(p);

      return {
        ok: true,
        ent: {
          pro: true,
          source: "play",
          productId: p.productId,
          orderId: p.orderId ?? null,
          purchaseTimeMs: p.purchaseTime ?? null,
          acknowledged,
          signatureChecked,
          syncedAtMs: Date.now(),
          account: null,
        },
      };
    } catch (e) {
      /* Never throw out of sync(). A billing failure must degrade to
         "unknown", which falls back to the cache, not to a crash and not
         to a silent unlock. */
      return { ok: false, reason: String(e?.message || e), ent: EMPTY };
    }
  },

  async purchase() {
    const B = globalThis.AliquotBilling;
    if (!B) return { ok: false, reason: "billing_bridge_missing" };
    const r = await B.launchPurchaseFlow(BILLING.productId, null);
    if (r?.code === "cancelled") return { ok: false, reason: "cancelled" };
    if (r?.code === "already_owned") return this.sync();   // restore, not an error
    if (r?.code !== "ok") return { ok: false, reason: r?.code || "error" };
    return this.sync();                                    // re-read, never trust the flow result alone
  },
};

/* ── Razorpay — direct-APK and web distribution only ─────────────────────
   Kept because it is correct outside Play. It must be unreachable in a Play
   build: shipping both and choosing at runtime is exactly the arrangement
   Play's policy prohibits.

   Open item 1 still stands for this path. Until BILLING.verifyUrl points at
   an endpoint that creates the order server-side and verifies the payment
   signature with the Key Secret, the amount comes from the device and a
   patched build pays ₹1. Do not ship this path commercially without it.
   ──────────────────────────────────────────────────────────────────────── */
const RazorpayProvider = {
  id: "razorpay",
  describe: () => "Razorpay — direct download build only, not Play",
  async sync() {
    const cached = readCache();
    return { ok: true, ent: cached.source === "razorpay" ? cached : EMPTY };
  },
  async purchase() {
    return { ok: false, reason: "razorpay_not_wired_here",
             detail: "Keep the existing src/pay/providers.js implementation. It must remain excluded from the Play build." };
  },
};

const PreviewProvider = {
  id: "preview",
  describe: () => "Preview build — everything unlocked, nothing charged",
  async sync() {
    return { ok: true, ent: { ...EMPTY, pro: true, source: "preview", syncedAtMs: Date.now() } };
  },
  async purchase() { return { ok: true }; },
};

function provider() {
  if (PREVIEW) return PreviewProvider;
  if (DISTRIBUTION === "play") return PlayBillingProvider;
  return RazorpayProvider;
}

/* ═════════════════════════════════════════════════════════════════════════
   LOCAL SIGNATURE VERIFICATION

   Play signs the purchase JSON with the app's RSA private key; the matching
   public key is in Play Console. Checking it on device catches a purchase
   forged by a repackaging tool that does not also patch this check.

   BE HONEST ABOUT WHAT THIS IS WORTH. An attacker who can patch the APK can
   patch this function to return true. It raises the cost of casual piracy;
   it does not stop a determined one. The only check that cannot be patched
   out is a server-side one against the Play Developer API, which is what
   BILLING.verifyUrl is the seam for — and which costs this app its
   offline-first property at first launch, which is why it is optional.

   Returns false — not an exception — when no public key is configured, and
   the account screen shows "signature not verified" so the state is visible
   rather than assumed.
   ═════════════════════════════════════════════════════════════════════════ */
async function verifySignature(purchase) {
  if (!BILLING.publicKey) return false;
  if (!globalThis.crypto?.subtle) return false;   // content:// origin — see build state
  try {
    const der = b64ToBytes(BILLING.publicKey);
    const key = await crypto.subtle.importKey(
      "spki", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-1" }, false, ["verify"]
    );
    return await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5", key,
      b64ToBytes(purchase.signature),
      new TextEncoder().encode(purchase.originalJson)
    );
  } catch {
    return false;
  }
}

function b64ToBytes(b64) {
  const s = atob(b64);
  const a = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
  return a;
}

/* ═════════════════════════════════════════════════════════════════════════
   CACHE — convenience only, never authority on a Play build
   ═════════════════════════════════════════════════════════════════════════ */
function readCache() {
  try {
    const raw = store.get(KEY);
    if (!raw) return EMPTY;
    const e = typeof raw === "string" ? JSON.parse(raw) : raw;
    return { ...EMPTY, ...e, pro: Boolean(e.pro) };
  } catch { return EMPTY; }
}
function writeCache(ent) {
  try { store.set(KEY, JSON.stringify(ent)); } catch { /* in-memory fallback */ }
}

/* ═════════════════════════════════════════════════════════════════════════
   PUBLIC API
   ═════════════════════════════════════════════════════════════════════════ */

let _ent = readCache();
let _lastSync = null;

export const entitlement = () => _ent;

/**
 * Call on app start and on every resume. Cheap, offline, never throws.
 * On a Play build a successful sync OVERWRITES the cache in both directions:
 * a refunded or revoked purchase removes Pro. A sync that fails leaves the
 * cache alone — a flat battery is not a revocation.
 */
export async function syncEntitlement() {
  const r = await provider().sync();
  _lastSync = { at: Date.now(), ok: r.ok, reason: r.reason || null };
  if (r.ok) { _ent = r.ent; writeCache(_ent); }
  return { ..._lastSync, entitlement: _ent };
}

export async function buyPro() {
  const r = await provider().purchase();
  if (r?.ent) { _ent = r.ent; writeCache(_ent); }
  else if (r?.ok) await syncEntitlement();
  return { ...r, entitlement: _ent };
}

/** "Restore purchases" — a required affordance. On Play it is just a sync. */
export const restorePurchases = syncEntitlement;

/** Module gate. The ONLY function the UI should ask about locking. */
export function isModuleUnlocked(modId) {
  if (!PRO_MODULES.includes(modId)) return true;
  return _ent.pro === true;
}

/** Routine gate — a routine inherits its module's state. */
export function isCalcUnlocked(calc) { return isModuleUnlocked(calc.mod); }

/**
 * What to print on the account screen. Every field is a fact about state,
 * not a reassurance. If the signature was not checked it says so.
 */
export function entitlementStatus() {
  const p = provider();
  return {
    distribution: PREVIEW ? "preview" : DISTRIBUTION,
    provider: p.id,
    providerNote: p.describe(),
    pro: _ent.pro,
    productId: _ent.productId,
    orderId: _ent.orderId,
    purchased: _ent.purchaseTimeMs ? new Date(_ent.purchaseTimeMs).toISOString().slice(0, 10) : null,
    acknowledged: _ent.acknowledged,
    signatureChecked: _ent.signatureChecked,
    signatureNote: BILLING.publicKey
      ? (_ent.signatureChecked ? "Purchase signature verified on this device"
                               : "Purchase signature NOT verified — check the licensing public key in config")
      : "No licensing public key configured — purchase signatures are not verified",
    lastSync: _lastSync,
    gatedModules: PRO_MODULES.slice(),
  };
}

/* ═════════════════════════════════════════════════════════════════════════
   THE TEST UNLOCK

   The old test unlock appeared whenever no Razorpay key was configured. That
   is a condition a release build can accidentally satisfy. This one is
   compiled out: PREVIEW is a build-time constant, so the branch is dead code
   in a Play build and the string never reaches the bundle.

   Do not add a runtime flag, a debug menu or a hidden gesture that reaches
   this. Every one of those ships.
   ═════════════════════════════════════════════════════════════════════════ */
export const testUnlockAvailable = () => PREVIEW === true;

export default {
  entitlement, syncEntitlement, buyPro, restorePurchases,
  isModuleUnlocked, isCalcUnlocked, entitlementStatus, testUnlockAvailable,
};
