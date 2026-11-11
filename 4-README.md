# Eseen: interim source snapshot

This repository currently provides the complete phase-3 prototype as **1-eseen-source.zip**, not a browsable source tree. Extract it before running the project. Folder paths and dotfiles are preserved; dependency folders, builds, credentials, and real email data are excluded.

Verify `3-SHA256SUMS.txt` for the ZIP and `2-SOURCE-SHA256SUMS.txt` for every extracted file. The local development history is retained separately, pending normal Git push access.

39 unit tests pass and a mock-page Playwright test passes compose -> pixel injection -> simulated image load -> popup status. No real Gmail account was used. Badge and thread-card UI components exist but are not yet connected to Gmail rows/threads. The popup is a basic prototype, not final visual design.

**Not production-ready:** in-memory storage, development authentication, no PostgreSQL adapter, no notifications/SSE/offline queue/dashboard yet. No deployment or live mail activation. Do not expose the server publicly or use real mail. The extracted README lists setup, test commands, and tracking limitations.

Open tracking records an image load, never proves a person read the email. Apple privacy loading, security scanning, blocked images and Gmail caching make it incomplete and uncertain.
