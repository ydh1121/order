# Public reference provenance — ASTRA_ENGINE_0499

Collected 2026-11-01 KST. These are source and omission checks, not proof of mailbox existence, delivery, ownership, customer identity, or order acceptance. No registrar is an email allowlist.

## IANA snapshot

`src/engine/reference/iana-manifest.json` pins the exact downloaded raw source:

| Field | Value |
|---|---|
| Source | https://data.iana.org/TLD/tlds-alpha-by-domain.txt |
| Version | 2026103100 |
| Source updated | 2026-10-31T07:07:01.000Z |
| Collection | See `collectedAt` in manifest (actual UTC download session) |
| Bytes / records | 9519 / 1436 |
| SHA-256 | `2bce1ee4d4e7f54ffe678f8852bccb499dc68c67c5018411d5ac346d3bdbda23` |
| Scope | ASCII root-TLD labels; IDN represented as A-labels |

The raw file is preserved byte-for-byte, including header and final newline. The loader validates raw hash, count, metadata and syntax. IANA's [root registry](https://www.iana.org/domains/root/db) describes delegations; the web registry also displays retired/reserved records, so it is not scraped as the active TLD input. `co.kr` is a registration suffix containing two labels; the TLD tested here is `kr`.

`maxAgeMs = 604800000` is a configurable, seven-day engineering freshness ceiling, not a business acceptance rule. Age includes source publication time, so redownloading stale data cannot refresh its authority. Missing/corrupt reference or stale absence must not establish an invalid email. The validator receives data and an explicit clock; no network read occurs in parsing.

Refresh explicitly with `node scripts/engine/update-iana.mjs`. One HTTPS request, 10-second default total deadline (maximum 30 seconds), 65536-byte ceiling, no redirects/retries, and length/header/ordering/count checks. A greater than 5% count reduction or older version requires review. Known public root labels are download sanity sentinels only, never the accepted-domain list. No sanity check proves completeness against a malicious source; the pinned exact hash and source provenance are the audit boundary. Failed refresh leaves the current manifest unchanged. Raw files are content addressed and written before atomic manifest replacement. Review raw/manifest diff and tests before committing; previous committed versions remain in Git.

## Standards read

| Primary source | Scope used |
|---|---|
| [RFC 5321 §§2.4, 4.1.2, 4.5.3.1, 5.1–5.2](https://www.rfc-editor.org/rfc/rfc5321.html) | Preserve local-part case. Distinguish dot-string, quoted-string and address literal. Use octet limits. Resolve MX first, with implicit host fallback only if no MX; temporary lookup errors differ from absent routes. Both IPv4 and IPv6 matter. |
| [RFC 7505 §3](https://www.rfc-editor.org/rfc/rfc7505.html) | A singleton MX with preference zero and exchange `.` means the domain accepts no mail. Combining it with other MX records is inconsistent configuration. |
| [RFC 6531 §§3.3–3.5](https://www.rfc-editor.org/rfc/rfc6531.html) | International local-parts require SMTPUTF8 capability; an ASCII-only input profile returns unsupported, not a universal syntax-invalid claim. |

These documents were actually opened via public web retrieval. No SMTP connection, recipient probe or verification email was sent. The resolver implementation has its own separately recorded synthetic and live-smoke evidence.

## Registrar cross-check samples

Official product pages were opened on 2026-11-01 KST. The sample test checks these labels against IANA; it does not contact or approve customer domains.

| Official source | Omission-test samples | Limit |
|---|---|---|
| [GoDaddy domains](https://www.godaddy.com/domains) | `app`, `com`, `net`, `co`, `xyz`, `dev`, `zip` | Observed official page examples, not a complete sale catalog. |
| [WHOIS registration](https://domain.whois.co.kr/regist/dom.php) | `kr`, `xn--3e0b707e` (`한국`), `com`, `net`, `co`, `asia`; navigation examples `coffee`, `market`, `photo`, `fitness` | Registration options include multi-label suffixes; only their final TLD is compared. |
| [IANA raw source](https://data.iana.org/TLD/tlds-alpha-by-domain.txt) | `ooo` | Included directly in the delegated list. Registrar sale is unnecessary for validity. |

The user's failing real domain was not supplied, so user-specific reproduction is NOT_RUN. A future supplied domain must remain out of public Git if personal/private. Price text, registrar promotions and account ownership are irrelevant to email syntax/DNS decisions and were not copied into rules.
