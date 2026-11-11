import type { Derived } from "@eseen/shared";
/** Shadow DOM widgets so Gmail's CSS and ours never collide. Wording is fixed by the spec; never says "read". */
const ICON: Record<string, string> = { SENT: "\u2713", OPENED: "\u{1F441}", POSSIBLY_OPENED: "\u25CC", NOT_OPENED_YET: "\u2013" };
const CSS = `:host{all:initial}.b{font:600 11px system-ui,sans-serif;display:inline-flex;gap:3px;align-items:center;border-radius:999px;padding:1px 7px;line-height:16px;background:#f1f5f9;color:#475569}
.OPENED{background:#d1fae5;color:#065f46}.POSSIBLY_OPENED{background:#e5e7eb;color:#4b5563}.SENT{background:#e0e7ff;color:#3730a3}
.card{font:13px system-ui,sans-serif;border:1px solid #c7d2fe;border-radius:10px;padding:10px 12px;margin:8px 0;max-width:420px;background:#fff;color:#0f172a}
.card h4{margin:0 0 6px;font-size:12px;color:#4f46e5;display:flex;justify-content:space-between}.r{display:flex;justify-content:space-between;gap:8px;margin-top:4px}.s{color:#64748b;font-size:11px}
.note{color:#64748b;font-size:11px;margin-top:6px}button{font:inherit;font-size:11px;color:#4f46e5;background:none;border:0;cursor:pointer;padding:0;text-decoration:underline}
@media (prefers-color-scheme:dark){.card{background:#1e293b;color:#e2e8f0;border-color:#4338ca}.s,.note{color:#94a3b8}.b{background:#334155;color:#e2e8f0}.OPENED{background:#065f46;color:#d1fae5}.POSSIBLY_OPENED{background:#475569;color:#e2e8f0}.SENT{background:#3730a3;color:#e0e7ff}}`;
export function rel(ms: number, now = Date.now()) { const m = Math.max(0, Math.round((now - ms) / 60000)); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; }
const exact = (ms: number) => new Date(ms).toLocaleString();
function host(html: string) { const h = document.createElement("span"); const r = h.attachShadow({ mode: "open" }); r.innerHTML = `<style>${CSS}</style>${html}`; return { h, r }; }
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export function renderBadge(d: Derived): HTMLElement {
  const { h } = host(`<span class="b ${d.status}" role="img" tabindex="0" title="${esc(d.tooltip)}" aria-label="${esc(d.label + ". " + d.tooltip)}"><span aria-hidden="true">${ICON[d.status]}</span></span>`);
  return h; // icon only so it never shifts Gmail's row layout
}
export interface CardEvent { at: number; classification: string; reason: string; uaFamily?: string }
export function renderCard(d: Derived, events: CardEvent[], opts: { combined: boolean; now?: number; showAuto?: boolean; sentAt?: number; subject?: string }): HTMLElement {
  let showAuto = opts.showAuto ?? false;
  const { h, r } = host("<div class='card' role='group' aria-label='Eseen'></div>");
  const paint = () => {
    const shown = events.filter((e) => showAuto || e.classification === "REAL_OPEN");
    const devices = [...new Set(events.filter((e) => e.classification === "REAL_OPEN" && e.uaFamily).map((e) => e.uaFamily!))].join(", ");
    r.querySelector(".card")!.innerHTML = `<h4><span>Eseen</span><button type="button" id="t">${showAuto ? "Hide" : "Show"} auto-loaded opens (${d.autoLoadedCount})</button></h4>
      ${opts.sentAt ? `<div class="s">Sent <span title="${exact(opts.sentAt)}">${rel(opts.sentAt, opts.now)}</span>${opts.subject ? ` · ${esc(opts.subject)}` : ""}</div>` : ""}
      <div class="r"><span>${opts.combined ? "All recipients (combined)" : "Recipient"}</span><span class="b ${d.status}" title="${esc(d.tooltip)}" tabindex="0">${ICON[d.status]} ${esc(d.label)}</span></div>
      ${d.firstOpenedAt ? `<div class="s">First opened <span title="${exact(d.firstOpenedAt)}">${rel(d.firstOpenedAt, opts.now)}</span> \u00B7 last <span title="${exact(d.lastOpenedAt!)}">${rel(d.lastOpenedAt!, opts.now)}</span> \u00B7 ${d.openCount} open${d.openCount === 1 ? "" : "s"}${devices ? ` \u00B7 ${esc(devices)}` : ""}</div>` : ""}
      ${shown.filter((e) => e.classification !== "REAL_OPEN").map((e) => `<div class="s">\u25CC ${rel(e.at, opts.now)}: ${esc(e.reason)}</div>`).join("")}
      <div class="note">${opts.combined ? "Gmail sends one copy to everyone, so this status covers all recipients together. " : ""}Opened means the image loaded; it is not proof anyone read the email.</div>`;
    r.getElementById("t")!.addEventListener("click", () => { showAuto = !showAuto; paint(); });
  };
  paint(); return h;
}
