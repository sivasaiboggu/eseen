# Eseen prototype changelog

## 2026-11-11: popup redesign

- Reworked the toolbar popup into a dense, product-style interface using the requested design tokens. Light and dark palettes, Inter fallbacks, 4px spacing grid, one accent color, 8px controls, 12px cards, 999px pills and one subtle shadow.
- Header is now plain with a 1px border; it shows the Eseen eye/check SVG, a live/offline connection dot and a settings gear. The tagline moved to the empty state.
- Added a summary strip for tracked today, opened and open rate; custom search and a segmented All / Opened / Not opened / Auto-loaded filter with counts.
- Rebuilt email rows with deterministic avatar colors, single-line title/meta, status pills using Lucide icons, relative time and an inline expandable timeline. The title fallback never renders the placeholder text “(no label)”.
- Added loading skeletons, a true empty state, empty search state, explicit error and offline banners, a signed-out card and a settings slide-over. The settings panel is currently an inert visual prototype; backend preference contracts are unchanged.
- Status wording stays honest: Opened, Sent, Not opened and Auto-loaded. Tooltips explain image-load uncertainty. No new browser permissions or backend changes.
- Added popup behavior, status mapping, title fallback, time formatting and calculated WCAG AA contrast tests. Actual light, dark and empty screenshots inspected in Playwright. The component demo page shows major list states.

Known remaining gaps: rows are not yet wired to Gmail thread/message IDs; live updates, settings persistence, dashboard, send acknowledgement, sender-side self-open suppression, PostgreSQL and verified Google identity are not implemented. The popup is still a local prototype, not production UI.
