# MSG0583 common publication boundary

This change starts from production `35f03043200fbf636d3901d7d564168073c553a4`.
It includes common accordion direction and Q2 current-input cost visibility with
the selected Spinning counter only. Draft PR17 remains a separate candidate;
its simple flow and schema9 are not dependencies of this publication.

Owners: numeric-input reports accepted raw state and composition; q2-cost
projects that state through the existing exact quantity/cost contract; app keeps
quantity/price inputs and amount output nodes stable; spinning-counter renders
one semantic final value and cancellable decorative reels. A row requires valid
positive quantity, price and matching unit; the total requires every active row.
Autosave readiness and animation completion are not cost-validity conditions.
Restored invalid input must remain reachable for repair, while editing guards
continue to block invalid exits. A unit-only change preserves original demand.

Accordion CSS changes the expanded transform from 180 to -180 degrees in the
existing owners; height, semantic state and keyboard ownership stay unchanged.

Independent expectation tests: test/engine/q2-cost-0583.test.mjs and
spinning-counter-0583.test.mjs. Built Chromium proof: common-cost-0583.smoke.mjs,
including intermediate frames, raw/IME state, exact amounts, storage-pending,
retarget/removal/reset/route cancellation and live reduced motion. Historical
money assertions read the semantic output, excluding aria-hidden reel digits;
expected monetary policy is unchanged. CI checks out and verifies the actual
PR head/main SHA, not an unreported synthetic merge tree.

Results are reported with the executing commit/CI ID. Local controlled-clock
checks are not browser, user-OS or user acceptance. Existing address, email,
commercial and unrelated approval limitations are unchanged.
