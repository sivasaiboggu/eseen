import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { summarize, toCsv, type Row } from "./stats";
const rel = (ms: number) => { const m = Math.max(0, Math.round((Date.now() - ms) / 60000)); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
function App() {
  const [api, setApi] = useState(() => localStorage.getItem("eseen.api") ?? "http://localhost:8787");
  const [userId, setUserId] = useState(() => localStorage.getItem("eseen.user") ?? "dev-user");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState(""); const [filter, setFilter] = useState("All");
  const load = async () => {
    setErr("");
    try { const r = await fetch(`${api}/v1/messages?limit=100`, { headers: { authorization: `Bearer ${userId}` }, cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`); setRows(await r.json()); }
    catch { setRows(null); setErr("Can't reach the tracking service. Check the URL and sign-in."); }
  };
  useEffect(() => { void load(); }, []);
  const s = useMemo(() => summarize(rows ?? []), [rows]);
  const shown = (rows ?? []).filter((m) => (filter === "All" || m.recipients.some((r) => r.status === filter)) && (!q || (m.label ?? "").toLowerCase().includes(q.toLowerCase()) || m.recipients.some((r) => ((r.recipientLabel ?? "").toLowerCase().includes(q.toLowerCase())))));
  return <main style={{ font: "14px system-ui", maxWidth: 900, margin: "24px auto", padding: "0 16px", color: "#0f172a" }}>
    <h1 style={{ fontSize: 20 }}>Eseen dashboard</h1>
    <p style={{ color: "#64748b" }}>Dev sign-in only until verified Google identity is activated. Statuses describe image loads, never proof anyone read an email.</p>
    <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
      <input aria-label="API URL" value={api} onChange={(e) => { setApi(e.target.value); localStorage.setItem("eseen.api", e.target.value); }} style={{ flex: 1 }} />
      <input aria-label="User ID" value={userId} onChange={(e) => { setUserId(e.target.value); localStorage.setItem("eseen.user", e.target.value); }} />
      <button onClick={load}>Reload</button>
    </div>
    {err && <p role="alert" style={{ color: "#b91c1c" }}>{err}</p>}
    <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
      <div className="card">Tracked<br /><b>{s.tracked}</b></div>
      <div className="card">Open rate<br /><b>{Math.round(s.openRate * 100)}%</b></div>
      <div className="card">Avg time to first open<br /><b>{s.avgFirstOpenMs !== undefined ? `${Math.round(s.avgFirstOpenMs / 60000)} min` : "-"}</b></div>
    </div>
    <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
      <input aria-label="Search" placeholder="Search recipient or subject" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} />
      <select aria-label="Filter" value={filter} onChange={(e) => setFilter(e.target.value)}>{["All", "OPENED", "NOT_OPENED_YET", "POSSIBLY_OPENED", "REGISTERED", "SENT"].map((f) => <option key={f}>{f}</option>)}</select>
      <button onClick={() => { const blob = new Blob([toCsv(rows ?? [])], { type: "text/csv" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "eseen-export.csv"; a.click(); }}>Download CSV</button>
      <button onClick={async () => { if (prompt("Type DELETE to erase all your data") !== "DELETE") return; await fetch(`${api}/v1/me`, { method: "DELETE", headers: { authorization: `Bearer ${userId}` } }); await load(); }} style={{ color: "#b91c1c" }}>Delete all my data</button>
    </div>
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead><tr style={{ textAlign: "left", color: "#64748b" }}><th>Recipient</th><th>Subject</th><th>Sent</th><th>Status</th><th>Opens</th></tr></thead>
      <tbody>{shown.flatMap((m) => m.recipients.map((r) => <tr key={r.id} style={{ borderTop: "1px solid #e2e8f0" }}>
        <td>{r.recipientLabel ?? "All recipients (combined)"}</td><td>{m.label ?? "Untitled email"}</td><td>{rel(m.sentAt)}</td><td>{r.status.replace(/_/g, " ").toLowerCase()}</td><td>{r.openCount}</td></tr>))}</tbody>
    </table>
    {!shown.length && !err && <p style={{ color: "#64748b" }}>Nothing tracked yet.</p>}
  </main>;
}
createRoot(document.getElementById("root")!).render(<App />);
