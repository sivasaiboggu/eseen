# Eseen - Know when it's seen. (work in progress, local only)
Gmail open tracker (Chrome MV3 + Fastify backend). v1 is open tracking only.

## Status
Phase 1 backend/classifier and Phase 2 compose prototype are implemented. Phase 3 has reusable Shadow DOM badge/thread-card components and a redesigned popup. **The badge/card components are not yet connected to live Gmail rows/threads.** The compose-to-pixel-to-popup flow passes a mock-page Playwright test. The dashboard (React+Vite, table with search/filter/CSV export, summary cards over confirmed sends only, delete/export) and the first-run onboarding page (honest limits, consent checkbox) are built and screenshot-verified against the dev backend with seeded mock data. 113 unit tests pass. Neither InboxSDK nor the fallback has been tested against real Gmail. This is an interim source snapshot, not a finished extension or production service.

Popup honesty guarantees (mock-E2E-verified): combined emails show a neutral group avatar and "All recipients" - no invented identity; the connection indicator only ever says "Demo", "Local API" (amber - reachable, not authenticated) or "Offline", never a bare green "live" claim; settings that work (tracking default, auto-open visibility, subject storage, theme) persist to chrome.storage.sync, while notifications are visibly disabled as "Not available yet" and data export/delete are disabled unless the local API is connected; there is no fake dashboard link. The popup bundles the Inter font (woff2) instead of relying on a system fallback, honours prefers-reduced-motion, and keeps WCAG AA contrast pairs under unit test.

Phase 4 is started: a live events stream (GET /v1/events, SSE) and background notification polling are implemented and mock-tested - notifications fire only on real opens, honor the notification prefs, and keep state across offline periods (retry next tick). The offline queue is implemented per spec (IndexedDB, exponential backoff): registration retries in place while the send is held (0.5s/1s/2s/4s), and if it still fails the user is asked whether to send without tracking - a registration is never queued for after the send, because the pixel must exist in the email and a late registration would be an orphan tracking nothing. Dropped self-view/sent-ack signals persist in IndexedDB and retry on the 1-minute tick with capped backoff (self-view markers expire after the 90s window, where a late marker would misattribute; sent-acks retry up to 24h / 10 attempts). List badges/thread cards attach only by exact Gmail thread ID reported by a Gmail-level signal (InboxSDK sent event) - never by subject guessing; fallback-path sends carry no thread ID and stay unbadged in the list. A PostgreSQL adapter exists (PgStore, migrations 001-002 including the ops idempotency table) and is selected with DATABASE_URL; it is verified against pg-mem (real SQL in-process) but NOT yet against a live Postgres server - that verification, plus subject/label encryption-at-rest, remains open. Without DATABASE_URL the dev store stays in-memory and all state (including idempotency keys) is lost on restart. Verified Google identity is implemented as a code path (RS256 signature against Google's JWKS + iss/aud/exp checks; when ESEEN_GOOGLE_CLIENT_ID is set, dev bearer auth is disabled) but NOT activated: the OAuth client registration in Google Cloud is a project-owner step, and the extension-side Google sign-in flow is not built. Store/privacy docs drafted (docs/privacy.md, docs/store-listing.md, docs/threat-model.md). Not implemented yet: extension-side Google sign-in flow and live-Postgres verification. The server currently uses in-memory storage (lost on restart) and development bearer-user-ID authentication. **Do not expose it publicly or use it with real mail.**

The InboxSDK path requires an owner-registered AppId. No account registration, deployment, real email sending, store submission or live-inbox activation is included in this snapshot.

## Run
    npm install && npm test
    ESEEN_SECRETS=change-me npm run dev -w backend
    npm run build -w extension     # then chrome://extensions > Developer mode > Load unpacked > extension/dist
To test from outside localhost use a Cloudflare Tunnel or ngrok to the backend and set the API URL in the extension (not yet configurable in UI).

## Known limitations
- Apple Mail Privacy Protection pre-loads images, so some opens are auto-loaded (shown as Possibly opened).
- Blocked images mean a real open can be missed ("No open detected").
- Gmail caches images, so repeat opens can be invisible.
- Gmail sends one copy to all To/Cc/Bcc, so status is combined unless separate copies are sent. Bcc recipients are never revealed.
- An open means the image loaded, not that the email was read. A Gmail-proxy load after the first minute is labelled Opened internally, but timing cannot prove a person opened it.
- Sender-side image-load suppression is partially mitigated, and never silently miscounted: ANY first pixel load within 60s of sending stays Possibly opened ("could be your own mail client, could be the recipient"), whether or not the marker registered - a compose-side load can never become a silent real open. The extension also marks a self-view window BEFORE injecting the pixel (ordering is unit-tested) so later sender views stay ambiguous too; if the marker call fails, the send proceeds unarmed (a hint never blocks a send) and the queued retry expires after the window. Registration retries carry a client idempotency key, so a committed-but-lost response replays the original registration instead of creating an orphan; the backend dedupes owner-scoped. and the mock E2E lets the compose-side image request through for real and asserts it is recorded as Possibly opened ("could be you, could be the recipient"), not an open. Limits: a genuine recipient open inside the 60s window is also downgraded; sender views after the window still count; and because Gmail's image proxy can fetch images without ever carrying sender-browser headers, even a declarativeNetRequest marker cannot guarantee suppression - no client-side fix is definitive, so residual ambiguity stays visible as Possibly opened rather than being hidden.
- Registration lifecycle is truthful: a registration starts as "Set up - send unconfirmed" and only becomes "Sent" after a Gmail-level signal (the InboxSDK compose sent event calls the sent-ack endpoint; first ack wins). The fallback path never confirms, since a resumed click cannot prove a send, and a pixel load never promotes a registration. Remaining uncertainty, documented: a Gmail undo-send after an ack is not observable and leaves a confirmed message; the InboxSDK path itself is untested against live Gmail.
- Per-recipient tracking needs separate copies; prepared in the backend only, not enabled.
- IP-based bot rules need real published ranges loaded at deploy time.
See docs/decisions.md.

## Mock end-to-end check
The fixture uses synthetic recipient addresses and intercepts mail.google.com requests, not a live account. Build the mock-specific bundle, then run:

    npx playwright install chromium --no-shell
    VITE_ESEEN_API=https://mail.google.com/api npm run build -w extension
    cd extension && node e2e/run.mjs

Do not load that mock build into a real inbox. Rebuild without VITE_ESEEN_API for local development. Modern Chrome blocks HTTPS-page requests to loopback; the fixture's test-only same-origin proxy is not a production transport.

## Source snapshots
A checksum-verified historical prototype archive is retained under `snapshots/phase3/`. The source tree at the repository root is newer and is the working version.
