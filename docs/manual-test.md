# Manual install & test guide (nothing here deploys or activates anything publicly)

## 1. Build and unit-test
    npm install
    npm test                 # 119 unit tests: shared, backend, extension, dashboard
    npm run build -w extension -w dashboard

## 2. Local dev backend
    ESEEN_SECRETS=dev-secret npm run dev -w backend        # in-memory store, dev bearer auth, localhost only

## 3. Load the extension (local only)
1. chrome://extensions > Developer mode on > Load unpacked > select `extension/dist`.
2. The onboarding page opens once on install. Read it and tick the acknowledgment.
   Until you do, Eseen does nothing: no compose toggle, no pixel injection, no
   registration, no badge decoration, no background polling (consent gate, E2E-verified).
3. Open the popup: connection indicator should read "Local API" (amber), never a live-account claim.

## 4. Mock end-to-end (synthetic, not a live inbox)
    npx playwright install chromium --no-shell
    VITE_ESEEN_API=https://mail.google.com/api npm run build -w extension
    cd extension && node e2e/run.mjs
    npm run build -w extension   # rebuild the dev bundle afterwards

## 5. Production-like storage check (requires a local PostgreSQL server)
The sandbox used for development has no PostgreSQL server, so the following steps
are written but NOT yet executed; the pg-mem suite covers the same SQL in-process.
    createdb eseen                                            # or: psql -c "create database eseen"
    export DATABASE_URL=postgres://localhost/eseen
    export ESEEN_DATA_KEY="$(openssl rand -base64 32)"        # 32 bytes, required - server refuses to start without it
    export ESEEN_SECRETS="$(openssl rand -hex 32)"
    npm run dev -w backend
    # register a tracked message with an opt-in subject, then verify at rest:
    curl -X POST localhost:8787/v1/messages -H "authorization: Bearer dev-user" \
      -H "content-type: application/json" \
      -d '{"subjectLabel":"roundtrip-check","recipients":[{"email":"a@b.c"}]}'
    psql eseen -c "select subject_encrypted from messages"    # must be hex ciphertext, never the words
    # restart the server: the message must still be listed (persistence + idempotency keys survive)

## 6. Verified Google identity (after the project owner registers the OAuth client)
    export ESEEN_GOOGLE_CLIENT_ID=<owner-registered client id>   # server: dev bearer auth turns off
    VITE_GOOGLE_CLIENT_ID=<same id> npm run build -w extension   # popup: "Sign in" appears in settings
    # Sign-in uses OIDC id_token via chrome.identity (state + nonce + audience + expiry checked).
    # With a client ID configured, an expired/missing session fails closed: no API calls, sign-in prompt.

## 7. Live Gmail validation (owner-approved, isolated test account only)
Not performed. Requires the owner's narrow plan approval: a dedicated test Gmail
account, InboxSDK AppId (owner-registered, VITE_INBOXSDK_APP_ID at build), and the
checklist in docs/store-listing.md.
