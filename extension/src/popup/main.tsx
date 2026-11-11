import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./popup.css";
export interface Row { id: string; label?: string; sentAt: number; mode: string; recipients: { status: string; label: string; tooltip: string; openCount: number; firstOpenedAt?: number }[] }
const ICON: Record<string, string> = { SENT: "✓", OPENED: "◉", POSSIBLY_OPENED: "◌", NOT_OPENED_YET: "–" };
export function ago(ms: number, now = Date.now()) { const m = Math.max(0, Math.floor((now - ms) / 60000)); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : `${Math.floor(m / 1440)} d ago`; }
export function App({ rows, demo, now }: { rows: Row[]; demo?: boolean; now?: number }) {
  const [f, setF] = useState("ALL"), [q, setQ] = useState("");
  const opened = rows.filter(r => r.recipients[0]?.status === "OPENED").length;
  const shown = rows.filter(r => r.recipients.length > 0 && (f === "ALL" || (f === "OPENED" ? r.recipients[0].status === "OPENED" : r.recipients[0].status !== "OPENED")) && (r.label ?? "").toLowerCase().includes(q.toLowerCase())).slice(0, 25);
  return <main>
    <header><div className="brand"><span className="mark" aria-hidden="true"><svg viewBox="0 0 28 28"><path d="M3 14s4-7 11-7 11 7 11 7-4 7-11 7S3 14 3 14Z"/><path d="m10 14 3 3 6-7"/></svg></span><div><h1>Eseen</h1><p>Know when it's seen.</p></div></div><span className="version">{demo ? "Demo data" : "Prototype"}</span></header>
    <section className="overview" aria-label="Last 25 tracked emails"><div><strong>{rows.length}</strong><span>Tracked emails</span></div><div><strong>{opened}</strong><span>With an open signal</span></div></section>
    <section className="inbox" aria-label="Recent activity"><div className="section-title"><h2>Recent activity</h2><span>Last 25</span></div>
      <div className="search"><span aria-hidden="true">⌕</span><input aria-label="Search tracked emails" placeholder="Find a subject label" value={q} onChange={e => setQ(e.target.value)}/></div>
      <div className="filters" aria-label="Filter tracked emails">{[["ALL", "All"], ["OPENED", "Opened"], ["NOT", "Not opened"]].map(([value, label]) => <button key={value} aria-pressed={f === value} onClick={() => setF(value)}>{label}</button>)}</div>
      {shown.length === 0 ? <div className="empty"><span aria-hidden="true">◌</span><h3>{rows.length ? "No matching emails" : "Your next signal starts here"}</h3><p>{rows.length ? "Try another label or filter." : "Tracked emails will appear here. This prototype is not ready for real mail."}</p></div> : <ul>{shown.map(r => { const x = r.recipients[0]; return <li key={r.id}><div className="message-heading"><h3>{r.label || "Subject not stored"}</h3><time title={new Date(r.sentAt).toLocaleString()}>{ago(r.sentAt, now)}</time></div><p className="audience">{r.mode === "combined" ? "All recipients · combined status" : `${r.recipients.length} recipients`}</p><div className="signal"><span className={`pill ${x.status}`} title={x.tooltip} tabIndex={0} aria-label={`${x.label}. ${x.tooltip}`}><span aria-hidden="true">{ICON[x.status]}</span> {x.label}</span><span className="count">{x.openCount ? `${x.openCount} image load${x.openCount === 1 ? "" : "s"}` : "No counted loads"}</span></div>{x.firstOpenedAt && <p className="first-open">First signal {ago(x.firstOpenedAt, now)}</p>}</li>; })}</ul>}
    </section><footer><details><summary>What does an open mean?</summary><p>An image loaded. It is not proof anyone read the email. Privacy tools may auto-load images; blocked images and Gmail caching can hide opens.</p></details><p className="dev-note">Local prototype · no real Gmail validation yet</p></footer>
  </main>;
}
function Root() {
  const [rows, setRows] = useState<Row[] | null>(null), [error, setError] = useState(false), [attempt, setAttempt] = useState(0);
  useEffect(() => { let active = true; setError(false); chrome.storage.sync.get({ userId: "dev-user" }).then(async s => { try { const r = await fetch("http://localhost:8787/v1/messages?limit=25", { headers: { authorization: `Bearer ${s.userId}` } }); if (!r.ok) throw Error("Unavailable"); const data = await r.json(); if (!Array.isArray(data)) throw Error("Invalid response"); if (active) setRows(data); } catch { if (active) setError(true); } }); return () => { active = false; }; }, [attempt]);
  return error ? <main className="connection"><h1>Eseen</h1><h2>Can't reach your tracking service</h2><p>Your activity is unavailable, not empty. Check that the local backend is running.</p><button onClick={() => setAttempt(attempt + 1)}>Try again</button></main> : rows ? <App rows={rows}/> : <main className="connection" role="status">Loading your activity…</main>;
}
const el = typeof document !== "undefined" && document.getElementById("root");
if (el) createRoot(el).render(<Root/>);
