/* =============================================================================
   Aliquot — src/pay/providers.js
   Payment channels and the instruments each one can actually offer.

   Pure configuration. No network, no SDK, no secrets. The Android build reads
   CHANNELS[DISTRIBUTION] to decide which purchase flow to open; the UI reads
   `instruments` to decide what to show the user BEFORE they commit, so nobody
   reaches a payment sheet expecting an option that is not there.

   ON "ADD GOOGLE PAY" — read this before changing anything.

   Google Pay is not a payment method you can add to Google Play Billing. Play
   accepts UPI, and Google Pay is a UPI app. So the user DOES pay with Google
   Pay — they choose UPI in the Play sheet, and the UPI intent hands off to
   whichever UPI app they have installed: Google Pay, PhonePe, Paytm, BHIM,
   their bank's app. Aliquot cannot present a Google Pay button inside a Play
   purchase and cannot favour one UPI app over another. What it CAN do, and now
   does, is say so on the paywall — "UPI, including Google Pay, PhonePe and any
   other UPI app" — so the user knows before tapping.

   On the direct / web channel the position is different: Razorpay exposes UPI
   intent per app, so a Google Pay branded option is available there and is
   enabled below.
   ============================================================================= */

/* Which build is this. Set at build time; never inferred at runtime. */
export const DISTRIBUTION = "play"; /* "play" | "direct" */

/* An instrument the user can actually complete a purchase with.
     id        stable key
     label     what the paywall says
     via       how it is reached, where that is not obvious
     note      anything the user should know before choosing it        */
const UPI = {
  id: "upi",
  label: "UPI",
  via: "including Google Pay, PhonePe, Paytm, BHIM and any other UPI app",
  note: "The Play payment sheet opens your UPI app to approve. One-time and, for subscriptions, UPI Autopay.",
};

const UPI_GPAY = {
  id: "upi-gpay",
  label: "Google Pay (UPI)",
  via: "UPI intent, Google Pay selected directly",
  note: "Opens Google Pay to approve. Other UPI apps are offered alongside.",
};

export const CHANNELS = {
  /* ---------------------------------------------------------------------- */
  play: {
    name: "Google Play Billing",
    provider: "play-billing",
    /* Play owns the payment sheet. This list is what Play accepts in India, not
       a list Aliquot chooses from. Verify against Play's own supported-payment-
       methods page for India before each release — it changes. */
    instruments: [
      UPI,
      { id: "card", label: "Credit and debit cards", via: "Visa, Mastercard, RuPay",
        note: "RuPay is one-time only; it cannot back a subscription." },
      { id: "playbalance", label: "Google Play balance" },
    ],
    unavailable: [
      { id: "wallet", label: "Digital wallets", why: "Not an accepted form of payment on Play." },
      { id: "gpay-button", label: "A Google Pay branded button",
        why: "Google Pay is reached through UPI, not as a separate Play method. The UPI option covers it." },
      { id: "bnpl", label: "Buy now, pay later", why: "Not an accepted form of payment on Play." },
      { id: "netbanking", label: "Net banking", why: "Discontinued on Play in India from October 2025." },
    ],
    /* Play's own rule: a store build must not open an external payment flow. */
    externalPaymentAllowed: false,
  },

  /* ---------------------------------------------------------------------- */
  direct: {
    name: "Direct / web — Razorpay",
    provider: "razorpay",
    instruments: [
      UPI_GPAY,
      UPI,
      { id: "card", label: "Credit and debit cards" },
      { id: "netbanking", label: "Net banking" },
      { id: "wallet", label: "Wallets" },
      { id: "paylater", label: "Pay later and EMI" },
    ],
    unavailable: [],
    externalPaymentAllowed: true,
  },
};

/* The paywall line, built from whatever the channel can actually do. Never
   hard-code this sentence — an instrument list that drifts from the payment
   sheet is worse than no list at all. */
export function paymentSummary(dist = DISTRIBUTION) {
  const ch = CHANNELS[dist];
  if (!ch) return null;
  const parts = ch.instruments.map((i) => (i.via ? `${i.label} — ${i.via}` : i.label));
  return `${ch.name}: ${parts.join(" · ")}`;
}

/* Guard. Shipping Razorpay inside a store build is a policy violation on Play,
   so the build fails rather than the listing. Called by scripts/smoke. */
export function assertChannelSane(dist = DISTRIBUTION) {
  const ch = CHANNELS[dist];
  if (!ch) throw new Error(`Unknown distribution channel "${dist}".`);
  if (dist === "play" && ch.externalPaymentAllowed) {
    throw new Error("A Play build must not enable an external payment flow.");
  }
  if (dist === "play" && ch.provider !== "play-billing") {
    throw new Error(`A Play build must use Play Billing, not "${ch.provider}".`);
  }
  return true;
}

export default CHANNELS;
