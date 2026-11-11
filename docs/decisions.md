# Decisions (Eseen)
Latest user spec (2026-11-11 19:21 IST) supersedes the first: **v1 is open tracking only**. No read-time, no clicks, no AI. Phase 1 click/read code was removed, not hidden.

1. **Combined status by default.** Gmail sends one body to all To/Cc/Bcc, so one pixel cannot say which recipient loaded it. Default: one pixel, one combined status ("All recipients (combined)"), limitation stated in API response and UI. Per-recipient pixels need separate copies per recipient; that is opt-in only and never done or revealed silently (Bcc stays private).
2. **"Opened" means "no automation signal found", not proof of a human.** Wording follows the spec: Opened / Possibly opened (auto-loaded) / No open detected / Sent. Never "read".
3. **IP rules are inert until ranges are loaded.** rules.json ipRanges are empty; Apple/scanner/data-center IP rules only fire once real published ranges are added at deploy time. UA rules work now. Raw IPs are used in-request only and never stored.
4. **Self-open is a heuristic.** The extension cannot attach a header to images Gmail's proxy fetches for the sender, so the x-eseen-self marker only helps requests the extension itself makes. Fallback: extension posts /self-view when the sender opens their own sent thread; the first load within 60s is SELF_OPEN. Risk: it could hide one genuine early open. Documented.
5. **Gmail integration:** MutationObserver with debounce and selectors in one file (selectors.ts). **Selectors are unverified against live Gmail**, and InboxSDK (needs an app id) is not yet integrated. No live Gmail testing without user approval.
6. **Send flow:** the click is held until the pixel exists. If creation fails, the user is asked whether to send without tracking; never silent.
7. **Storage:** MemoryStore now; Postgres schema in backend/migrations (no raw IP, hashed recipient emails with per-user salt, no token column since tokens are HMAC of recipient id).
8. **Dev auth** is a bearer user id. Google ID-token verification is not wired.
9. Nothing deployed; no real emails touched. No legal, GDPR or Chrome Web Store compliance is claimed, only designed toward.
