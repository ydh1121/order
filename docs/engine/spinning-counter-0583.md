# Q2 display counter — MSG0583

`web/spinning-counter.mjs` owns visual numeric drums only. The existing Q2
quantity/projection/exact-cost owner must decide when a row/total is complete,
then pass its already formatted positive currency string to `set()`. No amount
is converted to `Number`; only individual decimal digits enter motion math.
Incomplete raw input, zero, IME composition and missing units must not supply a
target. Autosave pending is a separate state and cannot repeatedly hide costs.

The output receives one accessible final string immediately. The reel is
`aria-hidden`; commas/currency do not roll. Right-aligned unchanged digit
columns are retained. Initial exposure rolls once, equal values do not restart,
and `hide()` clears the display without treating absence as zero. Call
`destroy()` before removing a row, and `settle()` on route exit. Rebinding one
output returns its existing controller. Generations reject even a cancelled
callback delivered late; runtime reduced-motion changes settle the latest value.
An output removed unexpectedly also stops at its next frame without painting.

The selected source is Transitions.dev `26-spinning-counter.md`, commit
`20d70c1262bf721c0300c2946cbe1fc7605a555c`, SHA256
`8092a9db166a7042d441c6817590ac34f7ec8de842b1c31a0ff933a82f1f4274`.
The supplied recipe, React cleanup comparison, free-manifest and full license
were inspected. This is a free effect under the **Transitions.dev License**,
not the repository tooling's MIT license. Copyright and full terms are retained
in `docs/licenses/transitions-dev.txt`; only the selected effect is adapted for
this product, not redistributed as a motion collection.

The source timing/shape tokens remain unchanged: 130ms per traversed digit,
90ms per column, 100ms anticipation, 740ms settling, 1.03 peak. The original
50° drum, neighbouring digit blur/fade and damped landing remain. No unrelated
count-up library or demo random value/button is included. ORDER adds initial
entry roll, semantic/visual separation, exact-string input, explicit lifecycle,
same-node reuse and live reduced-motion handling. Fast retargeting begins from
the previous committed display target, as in the pinned source; it is not a
claim of physically continuous mid-frame retargeting.

`test/engine/spinning-counter-0583.test.mjs` uses a controlled DOM/clock to check
exact-string output and cancellation independently. It is not browser visual
acceptance. Actual intermediate-frame, focus/caret, row-validity and accordion
direction evidence belongs to the integrated product browser suite.
