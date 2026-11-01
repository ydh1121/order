# MSG0519 address editor integration

This implements selected `PATTERNS[1]` from the verified QA12 source as a product
controller. QA12 CSS, iframe, toolbar, native modal calls and memory commits are
not part of the product implementation.

## COMPONENT_REUSE_MATRIX — editor consumers

| Product call site | Shared owner | Role and states |
| --- | --- | --- |
| `web/address-ui.mjs`: `open`, `close`, initial `bind`, final `sync` | `web/common-ui.mjs`: `OrderModalShell` | Nested dialog lifecycle, focus return to the Q3 trigger, current-dialog Tab cycle and scroll lock. Uses `variant: editor`, `contentSize: dynamic`. |
| `web/address-ui.mjs`: `mutate` | `OrderModalShell.resize` | Results, selection/detail appearance, empty/error/retry and list dismissal change content through one shared size owner. Closing dialogs receive only draft cleanup without restarting motion. |
| `web/index.html`: `address-editor-dialog` | `.q4-regular-dialog`, `.ui-editor-dialog`, `.q4-regular-panel/head/scroll/actions` | Existing panel, viewport, scroll and fixed action-region ownership. No address-specific height loop. |
| `address-close` and icon replacement | `OrderIcons.svg('close')`, `.ui-icon-button` | Existing icon-button interaction and shared glyph source. |
| `address-search-icon` and result icon | `OrderIcons.svg('search')` | Same original geometry consumed by the input and multiline results. |
| `address-search-field`, detail/dropoff fields | `.q3-editor-field`, `.ui-field-title`, `.ui-field__control`, `.ui-field-error` | Common title/control spacing, invalid border, focus and error state. Search transport failure stays neutral. |
| `address-query` wrapper | `.ui-search-field.ui-field__control` | One focus and invalid owner around icon and borderless text input. |
| `address-results` candidate buttons | `.ui-search-results`, `.ui-choice-row--multiline`, `.ui-choice-row__icon/copy/title/meta` | First-line icon alignment, address hierarchy and active option state. Common tokens own color, radius, sizing and focus. |
| `address-selected-lines` | `.ui-location-lines` | The same derived multiline address presentation used by the parent. Postal stays a string. |
| Confirm/cancel footer | `.ui-transaction-group`, `.ui-transaction-action`, primary variant | Shared transaction buttons; confirming the child does not invoke persistence. |
| Retry/next/clear | `.ui-copy-action` | Existing neutral text action morphology and minimum hit target. |
| Explicit missing-selection error | `onInvalid(query)` supplied by app `orderShake` | Error motion uses the common app owner and honors reduced motion. Parent errors continue through `q3PaintErrors` and normalized order validation. |

## Parent and search generations

`createAddressEditor({getParent, onConfirm, onInvalid})` exposes `open(trigger)`,
`cancel(reason)`, `invalidate()`, `isOpen` and a non-identifying `inspect()`.
`getParent()` supplies `{siteId, generation, site}`. The controller snapshots only
identity and the parent's edit generation. It clones address fields via
`addressFields`, never the whole site. Search generation is independent from the
parent generation.

`onConfirm({siteId, generation, address})` is synchronous and returns `false` to
reject a stale or otherwise unavailable parent. It must patch only the returned
address fields. There is no storage import or write in the address controller.
Duplicate confirms are consumed once. A parent identity/generation mismatch
blocks application. Parent cancellation invalidates the child before discarding
the parent draft.

Selecting the same base address uses `selectAddress` to preserve optional detail
and placement. Selecting a different base clears both inside the child draft.
Query edits alone preserve the prior selection and the parent. `주소 지우기` is
an explicit child action; its subsequent confirmation returns blank address
fields. Merely confirming an empty or unverified address is rejected. Q3 and the
final gate remain responsible for requiring a verified selected base address.

## Keyboard and request ownership

The editor owns composition state and a 300 ms debounce after normalized queries
reach two characters. The service owns transport, same-request merging and its
short memory cache. Opening, closing, detail/placement input, selection and modal
resizing do not start a search. Each edit aborts the previous consumer and changes
the search generation. A late response must match both search and parent session
before it may render.

The query is a combobox controlling an actual listbox. Arrow keys move the active
option; Enter selects it without moving focus into the candidate buttons. IME
Enter is ignored. Pointer-down on a candidate retains query focus through the
click, avoiding blur/selection races. Escape is captured once by the child: it
first closes the candidate list, then on a later press cancels the child. Parent
back navigation is dispatched by the app, which checks `addressEditor.isOpen`
before canceling the parent. Tab trapping and focus return stay with the shared
modal shell.

Failure, zero results and input-length rejection have distinct neutral status
messages. Provider reasons, keys and internal module terminology are never used
as customer copy. No query or address data appears in `inspect()`; it contains
only state, generation and request counters.

## Verification boundary

The implementation was syntax-checked locally. Shared pure address-contract tests
verify selected/legacy distinction, same/different selection, optional fields and
postal leading zero. Actual layout, middle frames, keyboard interactions and
transaction counts are covered by the separately executed address browser suite.
Those browser outcomes, actual government provider responses and user operating
systems must be reported separately; this document does not declare them passed.
