# MSG0517 common style owners

Scope: product source descended from `634a3f19432e30e8fb4996a2b6b48591f1803167` (tree equal to `643c288`). These are implementation changes, not user visual acceptance. `USER_APPROVED_LOWFI=NONE`, `G11=FAIL_USER_REWORK`, and `P26=IN_REVIEW` remain.

| Feedback | Cause | Shared owner and change | Verification boundary |
| --- | --- | --- | --- |
| F01 | `#sku-editor .picks[aria-invalid=true]` added a group outline separately from the existing control error contract. | Removed only that outline rule. `.ui-field-title[data-order-invalid=true]` uses the common danger token; individual `.pick` controls use their existing border and text. JS owns exposure/clearing and ARIA links. | Keyboard outline rules remain. Explicit validation, partial selection and clearing require actual product interaction checks. |
| F02 | A 44px native select competed with a shorter suffix in a baseline-aligned flex row. | `.numeric-field .input-unit` owns a 44px control plus its 1px underline. Both numeric inputs have the same height, line-height and zero block padding; select/suffix share meta typography. Existing unit select and minimum target remain. | Check empty/focus/filled/error and each/pack units at 320,375,390,768,1440px. No per-digit offset or fixed-number exception exists. |
| F05 | The arrow centered on the entire two-row `<dl>` height, so labels and wrapped values shifted its anchor. | `.ui-copy-review-values` owns three explicit columns and separate label/data rows. Semantic `<dl>` children occupy grid cells through `display:contents`; arrow aligns with the first data line and equal column gutters. Mobile orders current label/data → arrow → changed label/data. After label/data retain `--blue`; current stays neutral. | Actual contact-copy renderer is shared by Q3 and Q4. Transactions remain owned by JS, not CSS. |
| F07 | Base flex-start geometry competed with dialog-specific center rules; mixed-site icons had an 18px basis while the base icon was 20px. | One `.q4-check-row` owner: 44px minimum target, 20px icon, shared line-height/gap/state tokens. Explicit `--multiline` class anchors icon to the first line; all repeated dialog alignment/icon-size/radius overrides removed. | Actual rect, font, text range and captures are required; CSS declarations alone are not visual PASS. Linux Chromium does not establish Windows/iPhone/Android font or input acceptance. |

## Checkbox usage inventory

All current product custom checkbox rows come from two renderer functions: `contactCopyCheckbox` in `web/app.mjs` and `checkbox` in `web/q4-review.mjs`. Native schedule day buttons and other radio/button selectors are distinct control roles and are not silently converted into checkbox rows.

| Renderer/use | Variant | Owner retained outside geometry |
| --- | --- | --- |
| Q4 business-site assignment | Multiline: site name may wrap | `.q4-assignment-row` owns label/action columns; selection and repair controls keep their separate actions. |
| Q3 contact-copy field selection | Single line | Copy dialog owns two-column field arrangement. |
| Q3 contact-copy business targets | Multiline | Copy dialog owns target-list spacing. |
| Q4 repeat preferred-day toggle | Single line | Repeat section owns position and required weekday group. |
| Q4 global/per-site contact methods | Single line | `.qa-checks` owns the two-column arrangement and short-label truncation. |
| Q4 quality-test statement | Multiline | Field wrapper owns title/help hierarchy. |
| Q4 variable-quantity statement | Multiline | Variable-range wrapper owns dependent quantity inputs. |
| Q4 no-closure / irregular-closure controls | Single line | `.qa-day-exceptions` owns flow and wrapping. |
| Q4 copy field selection | Multiline: two-column text can wrap | Copy dialog owns field grid and full-width last option. |
| Q4 copy business targets | Multiline | Target list owns order and names. |
| Q4 bulk editing | Same corresponding field variant | Bulk shell reuses the same field renderer; no bulk-only checkbox geometry. |

Single-line and multiline variants share checked, unchecked, disabled, focus-visible and error painting. Explicit one-shot `q4-just-checked` animation and reduced-motion handling remain. Native input focus and label click hit areas are retained. Error paint changes the existing icon stroke; it does not add an outline around a row/group.

## Evidence and limits

CSS baseline at 634a is 171,164 bytes. The MSG0517 style patch including the quantity-note style is 171,053 bytes (111-byte reduction), while removing 27 repeated/obsolete contextual rules and replacing one group-outline rule. This is a source-size measurement, not a runtime performance claim; final build identity and evidence report own the final bytes/hash if subsequent edits change them.

The browser regression script retains the pinned original comparison for unaffected controls and identifies explicit F02 geometry deltas with narrow property allowlists and absolute geometry assertions. It includes 120 current numeric-row cases (five widths × blank/short/long × each/tray × normal/error × resting/focus-visible): 45px row, 44px input/select target, identical input font/line-height/padding/y position and 6px label gap. New same-state product captures cover Q1 error, Q2 input rows, Q3 contact comparison and Q4 check rows. Test fixtures/captures/report files remain outside the product build allowlist.
