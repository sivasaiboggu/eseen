# Chrome Web Store materials (draft, not submitted)

## Permission justifications
- storage: saves your settings (tracking default, theme, notification prefs) and the local offline queue.
- identity: Google sign-in, so your tracked emails belong to your account. (Used once the OAuth client is registered by the project owner.)
- notifications: optional "first open" alerts. Off by default.
- alarms: one 1-minute timer to retry offline queue entries and poll for new opens. Not a background keep-alive for remote code.
- scripting: InboxSDK requires it under MV3 to inject its page-world script into Gmail.
- host permission https://mail.google.com/*: Eseen only works inside Gmail - it decorates your own tracked sends in the Gmail list and thread view.
- host permission for the backend URL: the extension calls your own tracking service. The dev build uses localhost; production replaces it at deploy time.

## Limited Use style statement
Eseen is designed for the Chrome Web Store Limited Use requirements: it does not use or transfer data for advertising, does not allow humans to read user data, and only handles the email-tracking data the user explicitly creates. (Draft statement; final wording reviewed at submission.)

## Listing copy (draft)
Know when it's seen - honest open tracking for Gmail. Eseen shows when the tracking pixel in your sent emails is loaded, and is explicit about what that means: an image load, never proof anyone read your email.

## Pre-submission checklist
- [ ] Register InboxSDK AppId (project owner)
- [ ] Register Google OAuth client and enable identity (project owner)
- [ ] Deploy backend with PostgreSQL + HTTPS; production URL in build
- [ ] Verify live Gmail flow on an isolated test account (owner-approved)
- [ ] Privacy policy hosted at a public URL
- [ ] Opt-out page hosted (https://eseen.app/optout)
- [ ] Screenshots and store icons from the final build
