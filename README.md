# Eseen - Know when it's seen. (work in progress, local only)
Gmail open tracker (Chrome MV3 + Fastify backend). v1 is open tracking only.

## Status
Phase 1 (backend, classifier, tests) done. Phase 2 (extension compose hook, token creation, pixel injection) coded and unit-tested, **not tested against live Gmail**. Phases 3-5 not started.

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
- An open means the image loaded, not that the email was read.
- IP-based bot rules need real published ranges loaded at deploy time.
See docs/decisions.md.
