# ORDER PROJECT RULES (CODE1 HARNESS OVERLAY)
1. Latest user directives and CODE1 Drive READ FIRST/SNAPSHOT/FEEDBACK override this file. Work only in this repo and CODE1 role-specific order.ooo Drive folders.
2. NO HARDCODE is P0: no real-world price, farm, feed, availability, stock, supplier, advertising, status, order, or numeric dashboard data as UI literal/fake success. Test fixtures only inside test and never production bundles. Store real approved offers in data provider, not UI source.
3. Housing code 1-4 and egg sizes must be driven by approved catalog entries. Unavailable data shows explicit missing/unavailable state, never 0-price or invented seller.
4. Quote updates must patch existing numerical DOM nodes only; never remount the result card on every input change. Stable layout, skeleton for actual loading, empty/error distinct.
5. Every enabled control must map to a route/state/action in docs/screen-actions.json. Broken route or dead button is a failure.
6. Documents/receipts/business registration must never go to public URLs, localStorage, logs, or analytics. Until secure backend exists, submissions may validate in preview but cannot claim accepted.
7. Keep buyer B2B, supplier, negotiation, partner/direct-shipping, consumer future, and ad campaign concepts separated. Buyer-referral commission feature is deferred.
8. UI: ComeBackHome-inspired simplicity; no useless visuals/copy/cards. No bottom bar without evaluation. Respect Korean copy rules, 44px target, keyboard, reduced-motion. Suta/transitions.dev are references subject to license and fitness; not dependencies.
9. Design owner handles Figma screen-based flow map on existing order page after screen build. Alpine-code is coding agent reference, not proof of a built-in screen flow feature.
10. Preserve CODE1 premium product and other repos; don't edit originals. No production publish without real backend, data/permissions, legal and user acceptance.

## MSG0549 execution overlay
Fixed source entry: https://drive.google.com/file/d/19162YmgCYeyIP4Wgt_fYwORtQPqWYmSq/view; scope: https://drive.google.com/file/d/1uI3qTXj8byhzH2eUToeWrZmCABiekllz/view. See docs/engine/structure-0549.md for the five pinned skill versions and actual applied owners.
- Continue WO-ORDER-20261101-ASTRA-ENGINE-001; current scoped main integration and exact order-ooo.pages.dev development publication are authorized. Rule 10 remains the commercial-launch boundary, not a blanket development-publish hold. No alternate site/preview/IA changes.
- Before work: read own CURRENT, `git status`/remote ancestry, then `host.py resume` and only the fixed source needed for the next action. See `docs/engine/harness-0549.md`. Each concurrent worker uses a separate state directory. Never replay unknown actions. Verify terminal receipt and source/log hashes before durable export.
- Explicit composition: main → createOrderApp → createQ4Review({bridge}) → connectQ4 → boot. Existing window exports are compatibility/inspection surfaces, not app/Q4 dependency discovery.
- Shared gate owner: web/q4-validation.mjs + CODE1_ORDER_VALIDATION. Editor, saved badge and final gate must consume the same verdict. Pure reads must not mutate stored repeat/date/memory values.
- New manual consultation intent writes schema8 only after successful explicit commit; schemas1–7 read unchanged. Keep raw quantities, stable IDs, optional ONCE dates, cancel0/confirm1/duplicate0/stale protections.
- PENDING-29 fitting only is deferred. Monthly167-centered forecasts, new near-cadence tolerances and ONCE period unification remain proposals, not approved policy. Fixed-date selection remains D1R6; ONCE shares mechanics with its existing period.
- Run structural gate and independent failure/mutation cases. Keep mock/provider/Linux/user-OS results separate. Never reuse historical PASS totals as current results.
