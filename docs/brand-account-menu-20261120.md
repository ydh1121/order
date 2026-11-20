# Shared product brand and account menu

## Problem and change

The public product mounted a jelly-only header while the private runtime adapted that file into a different account menu. The result screen hid the normal header and built a third logo from static circles. Updating the shared menu therefore left two product consumers unchanged.

`web/brand.mjs` now owns the canonical product wrapper, geometry and original SVG creation. It imports the same `web/brand-account-menu.mjs` bytes as the IA shared module. Existing header SVG nodes and their three original paths survive mounting. The visible result header uses `createOrderBrand` and `mountOrderBrandElement` from the same factory; its chart and price DOM remain stable.

## Explicit composition and authentication

- `mountOrderBrand(root=document)` mounts existing original product headers.
- `createOrderBrand(doc)` creates the approved wordmark and the original CODE1 SVG through its existing `createSVG()` owner.
- `mountOrderBrandElement(brand, overrides)` consumes `window.ORDER_BRAND_ACCOUNT_CONTEXT`, optionally supplemented by an explicit adapter.
- `mountQuoteResult(host, options)` remains serializable and has no imported free variables. The caller passes `options.brandFactory`; existing isolated runtimes may supply the exact bundled factory as `window.OrderProductBrand`. `brand:false` needs no factory.
- Canonical `createOrderApp` explicitly imports the product brand namespace and passes it to the result component. Its `brandAccount` getter reads the current supplied account context.

Only the boolean `authenticated === true` from the supplied account adapter opens a member menu. URL parameters, a quote result, `data-r3-quote-partition` and cached preferences cannot authenticate anyone. Account leaf panels call the supplied `renderPanel` and role filters call `canAccess`; this UI introduces no account data or backend success.

`consumeArrival()` is a one-time UI transition receipt supplied after the authenticated transition. It does not authenticate. A connected visible brand consumes it and passes `animateInitial:true` to the shared menu. An already signed-in reload without a receipt is stationary. The account adapter owns the receipt across consumers. Existing `brand.__orderAccountMenu` remains the update/inspection surface.

## Figma geometry

At a375×828 frame the header is x24..351, y0..78. The Order footprint is72×25 at x24/y29.0234375. Resting member dots occupy x299/y32/51.874008×20.747786; guest dots occupy x104/y31.266745. A44px-tall interactive target surrounds the artwork.

The original SVG viewBox includes padding. The shared module computes the actual three-path union and uses an offset SVG canvas inside the trigger. The product wrapper applies only the header alignment and the0.125992px right inset. Existing quote-mode controls are positioned independently so enabling them does not shift the authenticated mark.

The word styling retains the approved onboarding typography, `800 26px Arial` and−1.6px tracking. The member period is hidden by the shared module. No replacement logo or alternate simulated circle renderer is used.

## Controls and test scope

All root, child, back and retry controls are mapped in `docs/screen-actions.json`. The root entries are 프로필, 알림, 관리. Profile has 계정, 개인정보, 연결된 계정; management has 납품일정, 결제 및 정산, 내 견적, 사업장 정보, 대시보드. Actual availability remains supplied by the account adapter.

`test/browser/brand-account-menu.smoke.mjs` loads the canonical product HTML and the real brand/result source modules in Chromium. Its account transport and transition receipt are explicit test-only adapters. It verifies denied implicit authentication, original path identity, guest/member geometry, login travel, menu hierarchy, reverse navigation, stable result nodes, cleanup, reduced motion and resizing. It writes screenshots and a report containing the exact tested source hashes. This test does not claim a real login or real account data; deployed authenticated flows are a separate verification.

Base product source was verified against `ydh1121/order@36cd9d6fe38b04a636b8035569887c6ba2da39b1`. The frontend allowlist includes the shared module and pins the changed file hashes. Product build/seal checks continue to validate the emitted dependency closure and source identity.
