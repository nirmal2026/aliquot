#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════
#  Aliquot — create the private repository and push this seed.
#
#  Run from inside the unzipped seed directory:
#      chmod +x bootstrap.sh && ./bootstrap.sh
#
#  Needs the GitHub CLI:  https://cli.github.com  (gh auth login)
#  If you do not have gh, use the manual route at the foot of this file.
#
#  PRIVATE is not a default here, it is a decision. See RELEASE.md Gate A:
#  the repository holds transcribed IS tables and will carry your name
#  against a commercial product before the sanction is in hand.
# ══════════════════════════════════════════════════════════════════════════
set -euo pipefail

REPO="aliquot"
OWNER="nirmal2026"

command -v gh >/dev/null || { echo "gh not found — see the manual route in this file"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "run: gh auth login"; exit 1; }

echo "==> creating ${OWNER}/${REPO} (private)"
gh repo create "${OWNER}/${REPO}" \
  --private \
  --description "Offline environmental laboratory calculator — personal project. Not a CPCB, MoEFCC or BIS product; no endorsement claimed or implied." \
  --disable-wiki

git init -b main
git add .
git -c user.name="${OWNER}" commit -m "Seed: taxonomy layer, Play Billing entitlement, CI gate, release gate

- src/data/taxonomy.js       category x matrix over 84 routines, limits index,
                             two-way auditor that fails the build on an orphan
- src/pay/entitlement.js     Play Billing; Razorpay confined to direct-APK builds
- scripts/verify-taxonomy.mjs CI gate, registry mode or self-check mode
- .github/workflows/ci.yml   taxonomy gate always runs; app and APK jobs skip
                             cleanly until the project tree is committed
- RELEASE.md                 Gate A: sanction to monetise, BIS copyright,
                             Play Billing. All three upstream of code.

Application tree not included — unzip aliquot-android-project.zip over this."

git remote add origin "git@github.com:${OWNER}/${REPO}.git" 2>/dev/null \
  || git remote set-url origin "git@github.com:${OWNER}/${REPO}.git"
git push -u origin main

echo
echo "==> done.  https://github.com/${OWNER}/${REPO}"
echo "    The 'Taxonomy gate' job runs now. 'verify' and 'apk' skip with a notice"
echo "    until you unzip aliquot-android-project.zip over the tree and commit."
echo
echo "==> to let Claude push here directly next time:"
echo "    GitHub → Settings → Applications → Claude → Configure"
echo "    → Repository access → add ${REPO}"

# ── manual route, no gh ───────────────────────────────────────────────────
#  1. github.com/new → name: aliquot → Private → do NOT initialise with
#     a README (this seed has one) → Create.
#  2. From inside this directory:
#         git init -b main
#         git add .
#         git commit -m "Seed: taxonomy layer, Play Billing entitlement, CI gate"
#         git remote add origin git@github.com:nirmal2026/aliquot.git
#         git push -u origin main
#  3. Before that first push, confirm nothing sensitive is staged:
#         git status --porcelain | grep -Ei 'keystore|\.jks|\.env|google-services|secret'
#     That must print nothing.
