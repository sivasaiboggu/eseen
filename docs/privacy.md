# Eseen Privacy Policy (plain language)

Eseen tracks whether the tracking pixel in an email YOU sent was loaded. Nothing more.

## What Eseen collects
- When you send an email with tracking on: a registration with the time and a generated tracking id.
- Recipient addresses are stored as salted hashes. Subject lines are stored only if you opt in, and then encrypted at rest (AES-256-GCM) when the production deployment sets the data key (ESEEN_DATA_KEY); the server logs a warning if that key is missing.
- When the pixel is loaded: the time, a coarse classification (real-looking open vs. automatic load), and a coarse user-agent family (for example "Apple Mail privacy relay"). Raw IP addresses are reduced to coarse flags in memory and never stored.

## What Eseen never does
- Never reads email bodies or inbox contents. Eseen reads only the recipient fields of emails you send with tracking on, the subject line only if you opt in, and thread identifiers used to place status badges. Only the tracking registration (hashed recipients, optional subject, thread id) and pixel-load events leave your browser.
- No ads, no analytics for advertising, no selling or sharing data with third parties.
- No remote code and no eval; the extension is Manifest V3 compliant.

## What a status means
A status describes an image load, never proof anyone read your email. Blocked images can hide real opens; automatic prefetch (for example Apple Mail Privacy Protection or security scanners) can cause false opens. Eseen marks uncertain loads "Possibly opened".

## Your controls
- Export all your data from the dashboard (CSV).
- Delete all your data from the dashboard. Deletion removes messages, events, and idempotency keys for your account.
- Recipients can opt out at the opt-out page; once opted out, their opens are no longer recorded for the sender who tracked them.
- The onboarding screen asks you to acknowledge that opens are inferred from image loads before tracking is enabled.

These controls are designed to support GDPR data-access and deletion requests; they are features, not a certification of legal compliance.

## Retention
Data is kept until you delete it. The development server uses in-memory storage and loses everything on restart; the production deployment uses PostgreSQL, with AES-256-GCM encryption at rest for optional subject labels when the deployment sets the data key (ESEEN_DATA_KEY).

Contact: project owner via the repository issue tracker.
