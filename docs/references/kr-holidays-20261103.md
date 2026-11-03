# MSG0528 — Korean holiday reference and start-date contract

Verified at `2026-11-02T15:16:42.255741Z` (`2026-11-03` Asia/Seoul). This is a reviewed static reference, not a live API result or a delivery commitment.

The product data owner is `src/engine/reference/kr-holidays.mjs`. The prior metadata is preserved in `kr-holidays-20261029-history.json`. The previous 46 dates are retained, with current source attribution, election classification and verification metadata. Snapshot version: `ORDER-KR-PUBLIC-20261103-v2`; coverage: 2026-01-01 through 2027-12-31. SHA-256 of UTF-8 `JSON.stringify(KR_HOLIDAY_SNAPSHOT.records)` is `98a458ea2c82cb0e778c72d4297e7d7f03df78b409548505ffe000812f061687`.

## Official evidence actually read

| Source | Publication / scope | Verification relevance |
| --- | --- | --- |
| [KASA 2026 almanac announcement](https://www.kasa.go.kr/prog/plcyBrf/brief/kor/sub01_01_04/view.do?plcyBrfNo=202) | 2025-06-30 | Annual 2026 dates; its original 70-day count predates the 2026 legal additions. |
| [KASA 2027 almanac announcement](https://www.kasa.go.kr/prog/plcyBrf/brief/kor/sub01_01_04/view.do?plcyBrfNo=431) | 2026-06-29 | 2027 holidays, Labor Day and Constitution Day additions, lunar dates and substitute-day sequences. |
| [MPM amendment notice](https://www.mpm.go.kr/mpm/comm/newsPress/newsPressRelease/?boardId=bbs_0000000000000029&cntId=4250&mode=view) | 2026-04-29 | Labor Day May1 and Constitution Day July17 are public holidays with applicable substitute rules. |
| [Current Public Agency Holiday Regulation](https://law.go.kr/lsLinkCommonInfo.do?lspttninfSeq=172595) | Presidential Decree36290, effective2026-05-11 | Current Article3 substitute conditions. Memorial Day does not create an automatic Monday substitute. |
| [MPM current holiday explanation](https://www.mpm.go.kr/mpm/info/infoService/BizService02/) | Current page read2026-11-03 KST | Legal holiday categories and the election-day rule. |
| [National Election Commission](https://si.nec.go.kr/) | Ninth nationwide local elections2026-06-03 | Confirmed election day; early voting May29–30 is not treated as a holiday. |
| [MPM holiday notice search](https://www.mpm.go.kr/mpm/comm/newsPress/newsPressRelease/?mode=list&searchCondition=title&searchKeyword=%EA%B3%B5%ED%9C%B4%EC%9D%BC) | Read2026-11-03 KST | No additional confirmed2026 temporary holiday found. This does not guarantee absence of later announcements. |
| [KASI2026 detailed table](https://astro.kasi.re.kr/kor/life/post/calendarData?year=2026), [KASI2027 detailed table](https://astro.kasi.re.kr/kor/life/post/calendarData?year=2027) | Historical2026 table; 2027 table updated2026-06-30 | Crosscheck only. These pages explicitly distinguish advance tables from the officially published gazette; that limitation is preserved. |

The authenticated KASI special-day API was **NOT_CALLED**. No API key was acquired or embedded. Annual gazette attachment bytes were not downloaded; announcement pages and current law were read. The snapshot does not contain company days, local holidays, early-voting days, supplier shutdowns or congestion rules.

Relevant boundaries independently tested:2027-05-03 Labor Day substitute,2027-07-19 Constitution Day substitute,2027-12-27 Christmas substitute; no fabricated2027-06-07 Memorial Day substitute. 2026-06-03 is an election record with NEC provenance.

## Coverage and maintenance

`ASTRA_ENGINE_EXECUTION` owns re-verification on the next annual KASA publication, legal amendment, confirmed temporary-holiday notice or election announcement. A replacement must update source metadata, dates, version, verification time and hash, then rerun the date tests. No new automatic fetch job or expiry duration was invented. `expiresAt:null` means this snapshot has no configured TTL; the engine supports an explicitly supplied expiry and rejects expired or unverified references. Coverage is checked for every traversed date.

2028 is not covered. D14 can prove preparation2027-12-24/28/29 and partial earliest candidate2027-12-30, but its January2028 upper bound remains `UNAVAILABLE`. D20's2028 leap arithmetic is valid independently of a verified2028 business calendar.

## Pure engine and product integration

`src/engine/calculation/civil-date.mjs` owns Gregorian arithmetic without local timezone/DST rollover. `calendar-forecast.mjs` continues to expose nominal quantity/calendar projection. `start-date.mjs` owns first-start eligibility and separately exposes recurring actual-date projection. `web/cadence-contract.mjs` re-exports the start APIs and owns strict serialized cadence intent.

| API | Contract |
| --- | --- |
| `startDateRange(options)` | Three complete preparation business days strictly after the injected application date; eligible candidates through the following month's last eligible day. Returns `min`, `max`, `preparationDates`, `candidates`, nominal/actual `occurrences`, versions, code and conditional message. |
| `inspectStartDate(value, options)` | Empty is optional. Partial input is neutral. Completed explicit input is checked/corrected against the same range. `adjust:false` validates without accepting a correction. The returned cadence is authoritative; raw input is never stored first. |
| `recurringDeliveryDates({from,to,cadence,...options})` | Generate monthly original dayRule or nominal anchor+n×14/21 first, then apply each occurrence's policy. A shifted actual date never seeds the next recurrence. |
| `holidayPolicyFromSelection(selection)` | Current product labels/legacy codes map to PREV/NEXT/KEEP/SKIP and store-closed weekdays. Empty/negotiation means no invented move. |

Inputs: `asOfLocalDate` is an explicit Seoul civil ISO date. The UI freezes it per edit transaction and rechecks on final confirmation. `holidaySnapshot` defaults to the reviewed reference; `null` or missing coverage is unavailable. `checkedAt` is injected when testing explicit reference expiry. Calendar arithmetic does not read a wall clock.

Operating policy input is separate: `{version,records:[{id,version,kind,start,end,scope,reason,source}]}`. Allowed kinds are `processingClosed`, `deliveryUnavailable`, `newStartUnavailable` and `warningOnly`. Scope explicitly identifies platform or supplier/route/region. No production operating records are installed by this change. Synthetic closure/warning cases live only in tests and the local QA LAB.

Cadence2.1 writes distinguish `preferredDate` (first actual) and `nominalAnchor` (original nominal). Both are empty when unselected. Monthly nominal31 and `last` remain distinct. Strict2.0 reads preserve their original meaning and reject new fields. Old per-week-v1 schedules are unchanged. `q4Review.startDateReview` records lifecycle, checked local day and versions; the cadence is the sole nominal-anchor owner.

Lifecycle `NEW` rechecks; explicit `STARTED` preserves an unchanged saved anchor. `LEGACY` preserves an unchanged past anchor without inferring a commercial order state. Future legacy dates and edited dates recheck. Viewing/restoring alone never writes or merges saved data.

## Verification

`node --test test/engine/start-date-0528.test.mjs` executes30 named independent D cases plus reference/cadence/mapping contracts. Exact expected dates are literals derived from the request and official calendar; production outputs are not used to manufacture expected values. The C26 regression files retain old semantic reads, while assertions superseded by MSG0528 are labeled explicitly.

These are Node pure-engine and production-declaration tests. Browser/LAB checks, same-source CI and canonical deployment are separate root-agent evidence; this document does not claim them. Synthetic temporary holidays, closures, expiry and routes are labeled fixtures, not production facts.
