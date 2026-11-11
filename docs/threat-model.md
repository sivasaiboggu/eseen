# Threat model (short)

## Assets
Tracking records (who tracked whom, when an image loaded), optional subject labels (AES-256-GCM encrypted at rest when the deployment sets ESEEN_DATA_KEY), user identity mapping, HMAC secrets.

## Threats and controls
- Pixel token guessing: tokens are HMAC-signed with constant-time compare; invalid tokens get the same cached 200 GIF response (no oracle, no enumeration). Key rotation via comma-separated ESEEN_SECRETS (first signs, all verify).
- Replay: a replayed pixel load records another open event but cannot forge a different message; classifications mark automatic loads.
- Abuse to track third parties without consent: mitigated by the recipient opt-out page, honesty-first UI wording, and per-user rate limits; abuse remains a policy risk, documented in the privacy policy.
- Sender-side self-opens: compose-side marker window (60s) downgrades early loads to "possibly opened"; residual ambiguity stays visible rather than hidden.
- Data leaks: recipient emails stored as salted hashes; subject labels opt-in and AES-256-GCM encrypted at rest when the deployment sets ESEEN_DATA_KEY (a loud startup warning covers a missing key); raw IPs reduced to coarse flags in memory only.
- DoS on the pixel endpoint: rate limits per IP and per token, invalid-token response caching, async event logging (the GIF response never waits on the database).
- Gmail DOM changes: selector updates come via signed remote config; on failure the extension shows "Eseen needs an update" and never breaks Gmail.
- Dev bearer auth: development-only identity (user id as bearer token); production requires verified Google identity (RS256 against Google's JWKS) or the server refuses non-local traffic.

## Known residual risks
- A determined recipient's mail provider can prefetch (false positive) or block (false negative) images; no client-side fix is definitive.
- Undo-send after a sent-ack is not observable.
- In-memory dev store loses state on restart; idempotency keys included.
