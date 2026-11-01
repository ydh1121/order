# Local QA LAB — MSG0510 / S05

The downloadable LAB is one HTML file built from the current product's `web/main.mjs` dependency graph, original `web/index.html` and original CSS. It uses the same phone, email, quantity, allocation and storage implementations. The builder changes static import specifiers and supplies three explicit QA dependency wrappers; it does not maintain a second product UI or engine.

```sh
node scripts/build-qa-lab.mjs
node scripts/build-qa-lab.mjs --out /absolute/path/order-qa-lab.html
node --test test/engine/qa-lab.test.mjs
```

Default output is `.qa-lab/order-qa-lab.html`, outside `dist`. Open that file directly in a current browser supporting modules, import maps, WebCrypto and dialog controls. No local server or dependency installation is required to open the completed file. The build itself uses the repository's existing Acorn dependency; no new bundler dependency is needed. The [HTML import-map standard](https://html.spec.whatwg.org/multipage/webappapis.html#import-maps) defines the mapping used to embed each module once as a data URL.

The header displays the full Git commit SHA. `qa-lab-identity` contains the original SHA-256 and byte length of every consumed module, HTML, CSS, fixture, builder and IANA source, as well as transformed module hashes and the import-map digest. By default the builder checks these source bytes against that Git commit and refuses uncommitted changes. `--allow-dirty` is only for implementation tests: both the header and identity then say `DIRTY_WORKTREE` and list changed source files. A dirty LAB must not be delivered as a fixed-commit result. The artifact's own SHA-256 is returned by the build command.

## Controls and isolation

| Control | Behavior |
| --- | --- |
| `#qa-lab-fixture` | Explicitly reloads with the synthetic 200 monthly-total / A50 manual / B remaining-suggestion fixture. No real price is supplied. |
| `#qa-lab-fail-next` | The next in-memory storage write throws once; the actual adapter and product error path handle it. |
| `#qa-lab-conflict` | A second instance of the actual adapter commits the current data with its current revision and version token. The original product state then has a stale token for its next confirmation. |
| `#qa-lab-restart` | Removes the fixture selection and reloads the LAB with empty memory. This is a LAB restart, not evidence of durable product reset. |
| `#qa-lab-dns` | Defaults to offline UNKNOWN. Explicit `example-route` selection supplies synthetic DNS JSON only for `example.com` and `mx.example.com`. |

Fixtures live only in `test/fixtures/qa-lab.mjs`. They are included in the downloadable LAB on purpose, and never in the product Pages inventory. The empty LAB does not preload businesses, contacts, orders or prices. Fixture selection is a fixed URL fragment, not an encoded customer payload. Reloading a fixture LAB restarts that fixture; edits made during the session are not durable.

The storage wrapper calls the unchanged `createBrowserStorage()` with a private in-memory key/value store, empty in-memory legacy-session store, queued lock implementation and a QA-specific key. It supplies these dependencies regardless of whether the HTML is opened as a file or accidentally served over HTTP(S). It never uses that origin's product `localStorage` or `sessionStorage`. The QA lock only serializes controlled writes within this LAB instance; it is not proof of native browser Web Locks or cross-tab durability. Explicit fixture load uses the actual adapter's validated commit path. Failure/conflict controls never patch product business state directly.

The IANA wrapper supplies the exact embedded, hash-verified source through an offline transport and a fixed synthetic reference origin. Freshness rules remain active; an old downloaded LAB may therefore report email UNKNOWN and should be regenerated. The email wrapper supplies the selected offline/synthetic transport to the unchanged service. No mailbox ownership or actual delivery is established. A `connect-src 'none'` content security policy blocks external network calls, including when the file is served from a real web origin. Synthetic DNS is never reported as online evidence.

Only the LAB build substitutes dependency imports. The product module graph has no mutable QA resolver, storage, snapshot or fixture hook. The production build remains its explicit allowlist, and the LAB builder rejects any output under `dist`.

## Evidence boundaries

The Node LAB test checks fixed-source provenance, import-only transformations, embedded assets, absence of production fixture paths, dirty-source refusal, output exclusion, the real storage adapter with in-memory failure/conflict behavior and offline DNS control. It is a synthetic test; its fake DOM is limited to the LAB toolbar and does not validate product rendering.

The browser LAB smoke should separately record file-origin boot, actual product interaction, optional fixture/restart controls, failure and conflict feedback, and HTTP same-origin product-storage sentinel isolation. `data-qa-lab-ready="true"` signals module execution; product initialization is independently indicated by `data-storage-ready="true"`. `data-qa-lab-storage="ISOLATED_MEMORY"` and `data-qa-lab-fixture="none|allocation-200"` expose scope to the browser evidence recorder without an application mutation API.

Local-file interaction does not verify canonical HTTPS persistence, new-tab restoration, real browser-profile restart, a later deployment, native cross-tab locks or real DNS/CORS. Those checks belong to the separate product storage suite and the canonical `https://order-ooo.pages.dev/` acceptance record. LAB tests, product synthetic tests and canonical observations must retain separate outcomes.

The Chromium workflow copies the exact HTML that passed the LAB checks into `browser-evidence/qa-lab/order-qa-lab.html` for its Actions evidence artifact. Deliver those bytes with the recorded SHA-256 when a byte-exact tested download is required. This evidence copy remains outside `dist`. A separately regenerated file from the same commit is source-equivalent but has its own generation timestamp and hash.
