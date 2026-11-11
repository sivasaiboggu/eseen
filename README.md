# Eseen (work in progress)
Email open/click tracker for Gmail. Status: **Phase 1 done** (backend pixel, events, status engine, tests). Extension, dashboard, brand kit not started.

## Honest limits
Tracking pixels cannot prove delivery, who opened, or reading time. Statuses are heuristics with confidence labels. Flagged bot events are kept, never deleted.

## Run
    npm install && npm test
    ESEEN_SECRETS=change-me npm run dev -w backend   # dev auth: Bearer <userId> (replace with Google ID-token check)

## Decisions so far
- In-memory store behind a seam; Postgres schema in backend/migrations/001_init.sql (not yet wired).
- Pixel and invalid tokens return the same GIF (no token-guessing oracle). Links redirect only to URLs stored server-side for that signed token.
- Apple proxy IP ranges are not hardcoded; to be loaded from Apple's published list at deploy time.
- Self-open filter: extension sends x-eseen-self header (cookie part comes in Phase 4).
- Redis rate limiting is an in-process limiter for now. Nothing deployed.
