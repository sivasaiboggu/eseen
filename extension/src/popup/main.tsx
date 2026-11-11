import React, { useEffect, useState } from "react"; import { createRoot } from "react-dom/client"; import "./popup.css";
export interface Row { id: string; label?: string; sentAt: number; mode: string; recipients: { status: string; label: string; tooltip: string; openCount: number; firstOpenedAt?: number }[] }
const ICON: Record<string, string> = { SENT: "\u2713", OPENED: "\u{1F441}", POSSIBLY_OPENED: "\u25CC", NOT_OPENED_YET: "\u2013" };
export function ago(ms: number, now = Date.now()) { const m = Math.round((now - ms) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; }
export function App({ rows, demo, now }: { rows: Row[]; demo?: boolean; now?: number }) {
  const [f, setF] = useState("ALL"), [q, setQ] = useState("");
  const shown = rows.filter((r) => (f === "ALL" || (f === "OPENED") === (r.recipients[0].status === "OPENED") || (f === "NOT" && r.recipients[0].status !== "OPENED")) && (r.label ?? "").toLowerCase().includes(q.toLowerCase()))
    .filter((r) => f !== "NOT" || r.recipients[0].status !== "OPENED").filter((r) => f !== "OPENED" || r.recipients[0].status === "OPENED").slice(0, 25);
  return <main>
    <header className="hd"><b>Eseen</b><span className="tag">Know when it's seen.</span>{demo && <span className="pill demo">Demo data</span>}</header>
    <div className="row"><input aria-label="Search tracked emails" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
      <select aria-label="Filter" value={f} onChange={(e) => setF(e.target.value)}><option value="ALL">All</option><option value="OPENED">Opened</option><option value="NOT">Not opened</option></select></div>
    {shown.length === 0 && <p className="empty">No tracked emails yet.</p>}
    <ul>{shown.map((r) => { const x = r.recipients[0]; return <li className="row" key={r.id}>
      <div><div>{r.label ?? "(no label)"}</div><div className="sub">{r.mode === "combined" ? "All recipients combined" : `${r.recipients.length} recipients`}{x.firstOpenedAt ? ` \u00B7 first opened ${ago(x.firstOpenedAt, now)}` : ""}{x.openCount > 1 ? ` \u00B7 ${x.openCount} opens` : ""}</div></div>
      <span className={`pill ${x.status}`} title={x.tooltip} tabIndex={0} aria-label={`${x.label}. ${x.tooltip}`}><span aria-hidden="true">{ICON[x.status]}</span> {x.label}</span></li>; })}</ul>
  </main>;
}
function Root() {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => { chrome.storage.sync.get({ userId: "dev-user" }).then(async (s) => { try { const r = await fetch("http://localhost:8787/v1/messages?limit=25", { headers: { authorization: `Bearer ${s.userId}` } }); setRows(await r.json()); } catch { setRows([]); } }); }, []);
  return rows ? <App rows={rows} /> : <p className="empty">Loading</p>;
}
const el = typeof document !== "undefined" && document.getElementById("root");
if (el) createRoot(el).render(<Root />);
