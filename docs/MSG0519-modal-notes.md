# MSG0519 common modal and field owners

Scope: existing order product source, continuing `4deef1d`. The address adapter
consumes these common owners; no QA12 iframe/native lifecycle is transplanted.
Actual browser captures and provider results are recorded separately by the
integration report. This document does not claim OS or visual acceptance.

## Component reuse matrix

| Owner | Source / consumer hook | Token / state | Behavior and impact |
| --- | --- | --- | --- |
| Native modal stack | `web/common-ui.mjs` `OrderModalShell.open/close/bind/sync` | `--ui-modal-backdrop`, `--ui-modal-fade-open`, `--ui-modal-fade-close`, `--ui-ease`; top/open/closing | Existing Q1, Q3, Q4, copy and new address dialogs share lock, cancel, focus trap and focus return. Desktop close remains synchronous; mobile close fades. |
| Content-size motion | `OrderModalShell.resize(dialog, mutate?, {animate:true})` | `--ui-motion`, `--ui-ease`, reduced motion; `data-modal-resizing` | Explicit mutation measures from current panel height to bounded natural content height. One animation per dialog; a new resize cancels the old one. Existing editors keep session height unless explicitly resized. |
| Viewport size | Same shell, window resize and `visualViewport` resize/scroll | `--ui-modal-max-block`, `--ui-modal-viewport-top/bottom` | One shared animation-frame scheduler caps editor height during viewport changes; header/footer remain nonshrinking, body owns scrolling. Actual software keyboard behavior needs device QA. |
| Root gutter / scroll lock | `paintLock`, `.ui-modal-locked`, `.ui-modal-body-locked`, `dialog[data-modal-variant]::backdrop` | Actual computed backdrop color, original canvas, nested depth | Composites the actual shared backdrop token into reserved root gutters. Keeps existing `scrollbar-gutter:stable both-edges`, with no popup widening, negative margins or global overflow mask. Child close retains parent dim/lock; final close restores prior custom property, classes and scroll. |
| Editor skeleton | `.q4-regular-dialog.ui-editor-dialog` and `.q4-regular-panel/head/scroll/actions` | Existing modal inline padding, title/field/transaction tokens | New address editor uses the same card, header, scrolling content and fixed footer as current editors. |
| Field trigger | `.ui-field-trigger.ui-field__control`, `.ui-field-trigger--multiline` | `--ui-control-height/radius`, `--ui-border`, choice hover tokens, focus and danger tokens | Shared single-line icon/text center; multiline aligns icon against first title line. Disabled, keyboard focus, explicit error and pointer states remain field-owned. |
| Search control | `.ui-search-field.ui-field__control > svg + input.text-input` | Same control/field tokens | Wrapper owns border and focus-within outline; no duplicated input outline or local color. |
| Candidate row | `.ui-search-results > .ui-choice-row.ui-choice-row--multiline` | Same control radius/height/border, existing choice selected/hover palette | `__icon` aligns within first title-line box, `__copy` contains `__title` and `__meta`. Selection via `aria-selected`; disabled and focus states use common tokens. |
| Address display | `.ui-location-lines` | Existing information gap and typography | Road/detail sentence, postal string and optional dropoff line supplied by domain adapter; CSS adds no empty text or dash. |
| Glyphs | `OrderIcons.svg('search')` and `OrderIcons.svg('close')` | Project-original 20×20 circle/line geometry, inherited currentColor, existing 1.7 stroke | No external asset or approximate color. Marked decorative; accessible name belongs to the control. |
| Transaction / close controls | `.ui-transaction-group/action`, `.ui-icon-button` | Existing button radius, height, focus, disabled and primary tokens | Address controller uses existing controls, not address-specific variants. |
| Error state | `q3PaintErrors`, `CODE1_ORDER_ERRORS`, `orderShake`, `.ui-field-error` | Existing danger/focus/shake/reduced-motion contracts | Parent address gate and explicit child selection omission use field-level states. Provider availability is a neutral status, not a red user-input error. |

## Address adapter usage

```js
OrderModalShell.bind(dialog, requestCancel);
OrderModalShell.open(dialog, {
  variant: 'editor', contentSize: 'dynamic', returnFocus: trigger,
  initialFocus: queryInput,
});
OrderModalShell.resize(dialog, () => renderCandidatesAndFields());
OrderModalShell.close(dialog);
```

`resize` returns `false` and does not call its mutation for a closed, closing or
unregistered dialog. Callers must not use a second height observer/timer. The
address controller remains responsible for IME, generations, query cancellation,
selection state and parent-draft transactions. The shell does not fetch or save.

`cancel` and backdrop handlers accept only the top registered dialog. The input
controller prevents Escape's default action while closing the candidate list;
the next Escape can request cancellation of the child. Tab wraps only within
the top dialog, with hidden/disabled/inert controls excluded.

## Verification

`node --test test/engine/modal-shell-0519.test.mjs` exercises eight production-owner
cases with controlled DOM/animation doubles: nested lock/focus/scroll restoration,
top-only cancellation, interrupted content resize, reduced motion, visual viewport
events, close/reopen race, stale mutation rejection and Tab isolation. These are
not eight browser or visual cases.

Browser evidence must include full viewport edges at desktop and mobile widths,
empty/short/long candidates, selected optional fields, explicit error show/clear,
and start/middle/end frames during opening, resizing and mobile closing. Record
dialog/panel/body/footer rects, scroll positions, active control, computed backdrop
and root background, font metrics, and reduced-motion state. Check nested child
close and last parent close separately. Emulated viewport shrink is distinct from
an actual mobile keyboard. Windows 100/125/200 percent zoom remains NOT_RUN unless
that real environment is actually available.

The earlier profile relaunch DNS timeout remains of unknown cause; this modal
work does not resolve or reclassify that historical observation.
