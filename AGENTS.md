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
