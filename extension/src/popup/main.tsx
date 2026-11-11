import React, { useEffect, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Bot, Clock, Eye, EyeOff, Search, Settings, X, ChevronLeft, Download, Trash2, ExternalLink, Sun, Moon, Monitor, Users } from "lucide-react";
import "./popup.css";

export type UiStatus = "opened" | "not_opened" | "sent" | "possible" | "registered";
export interface Recipient { status: string; label: string; tooltip: string; openCount: number; firstOpenedAt?: number; lastOpenedAt?: number; uaFamily?: string; email?: string; name?: string; threadUrl?: string }
export interface Row { id: string; label?: string; subject?: string; sentAt: number; mode: string; recipients: Recipient[] }
type Filter = "ALL" | "OPENED" | "NOT_OPENED" | "AUTO";
type Theme = "system" | "light" | "dark";
export type Connection = "prototype" | "api" | "offline";
export interface Prefs { enabled: boolean; notifications: boolean; notifyFirstOpen: boolean; showAuto: boolean; storeSubjects: boolean; theme: Theme }
export const defaultPrefs: Prefs = { enabled: true, notifications: false, notifyFirstOpen: false, showAuto: true, storeSubjects: false, theme: "system" };

export function mapStatus(s?: string): UiStatus { return s === "OPENED" ? "opened" : s === "POSSIBLY_OPENED" ? "possible" : s === "SENT" ? "sent" : s === "REGISTERED" ? "registered" : "not_opened"; }
export function titleFor(row: Row): string { const r = row.recipients[0]; return row.label || row.subject || r?.name || r?.email || "Untitled email"; }
export function relativeTime(ms: number, now = Date.now()): string { const diff = now - ms; if (diff < 45_000) return "just now"; if (diff < 3_600_000) return new Intl.RelativeTimeFormat(undefined, { numeric: "always" }).format(-Math.round(diff / 60_000), "minute"); if (diff < 86_400_000) return new Intl.RelativeTimeFormat(undefined, { numeric: "always" }).format(-Math.round(diff / 3_600_000), "hour"); const d = new Date(ms), today = new Date(now); const yesterday = new Date(now); yesterday.setDate(today.getDate() - 1); const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(d); if (d.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`; return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(d); }
export function exactTime(ms: number): string { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(ms)); }
export function avatarTone(key: string): [string, string] { const tones: [string, string][] = [["#EEF0FF", "#4F46E5"], ["#E7F8F0", "#047857"], ["#FEF3E2", "#B45309"], ["#FDE8F2", "#BE185D"], ["#E0F2FE", "#0369A1"], ["#F3E8FF", "#7E22CE"], ["#ECFCCB", "#4D7C0F"], ["#FFE4E6", "#BE123C"]]; let h = 0; for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0; return tones[h % tones.length]; }
function initials(s: string): string { const p = s.trim().split(/\s+/); return (p[0]?.[0] ?? "U").toUpperCase() + (p[1]?.[0] ?? "").toUpperCase(); }

/** Synced preferences. Falls back to defaults outside the extension (demo page, tests). */
function usePrefs(): [Prefs, (patch: Partial<Prefs>) => void] {
  const [prefs, setPrefs] = useState(defaultPrefs);
  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.storage?.sync) return;
    let live = true;
    chrome.storage.sync.get(defaultPrefs).then((v) => { if (live) setPrefs(v as Prefs); }).catch(() => {});
    const sub = (changes: Record<string, chrome.storage.StorageChange>, area: string) => { if (area !== "sync") return; setPrefs((p) => { const n = { ...p }; for (const k of Object.keys(defaultPrefs) as (keyof Prefs)[]) { const c = changes[k]; if (c) (n as Record<string, unknown>)[k] = c.newValue; } return n; }); };
    chrome.storage.onChanged.addListener(sub);
    return () => { live = false; chrome.storage.onChanged.removeListener(sub); };
  }, []);
  const update = (patch: Partial<Prefs>) => { setPrefs((p) => ({ ...p, ...patch })); if (typeof chrome !== "undefined" && chrome.storage?.sync) void chrome.storage.sync.set(patch); };
  return [prefs, update];
}

function Mark({ className }: { className?: string }) { return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" stroke="#4F46E5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="m8.5 12 2.5 2.5 5-5" stroke="#047857" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function StatusPill({ status }: { status: UiStatus }) { const m = statusMeta[status], I = m.icon; return <span className={`pill ${status}`} title={m.tip} tabIndex={0} aria-label={`${m.label}. ${m.tip}`}><I size={14} aria-hidden="true"/>{m.label}</span>; }
const statusMeta: Record<UiStatus, { label: string; icon: typeof Eye; tip: string }> = { opened: { label: "Opened", icon: Eye, tip: "The tracking image loaded. This does not prove the email was read." }, not_opened: { label: "Not opened", icon: EyeOff, tip: "No open detected. The recipient may have images blocked." }, sent: { label: "Sent", icon: Clock, tip: "Send confirmed by Gmail. No events yet." }, possible: { label: "Auto-loaded", icon: Bot, tip: "This open may have been triggered by Apple Mail Privacy Protection or a security scanner." }, registered: { label: "Set up", icon: Clock, tip: "Tracking was set up, but no send was confirmed - the email may not have been sent." } };

function Avatar({ recipients }: { recipients: Recipient[] }) {
  const known = recipients.filter((r) => r.name || r.email);
  // Combined mode covers all recipients together and knows no individual identity: neutral group icon, never initials derived from a status label.
  if (!known.length) return <span className="avatar neutral" aria-hidden="true"><Users size={16}/></span>;
  const [bg, fg] = avatarTone(known.map((r) => r.email || r.name || "").join(","));
  const style = { "--avatar-bg": bg, "--avatar-text": fg } as React.CSSProperties;
  if (recipients.length > 1) return <div className="avatar-stack"><span className="avatar" style={style}>{initials(known[0].name || known[0].email || "E")}</span><span className="more">+{recipients.length - 1}</span></div>;
  return <span className="avatar" style={style}>{initials(known[0].name || known[0].email || "E")}</span>;
}
function Highlight({ text, query }: { text: string; query: string }) { if (!query) return <>{text}</>; const i = text.toLowerCase().indexOf(query.toLowerCase()); if (i < 0) return <>{text}</>; return <>{text.slice(0, i)}<mark>{text.slice(i, i + query.length)}</mark>{text.slice(i + query.length)}</>; }
function SkeletonRows() { return <div aria-label="Loading tracked emails">{Array.from({ length: 5 }, (_, i) => <div className="skeleton-row" key={i}><span className="sk sk-circle"/><div><div className="sk sk-title"/><div className="sk sk-meta"/></div><span className="sk sk-pill"/></div>)}</div>; }
function EmptyState({ onOpenGmail }: { onOpenGmail: () => void }) { return <div className="empty"><svg viewBox="0 0 64 64" fill="none" aria-hidden="true"><rect x="8" y="18" width="48" height="30" rx="4" stroke="currentColor" strokeWidth="2"/><path d="m8 22 24 14L56 22" stroke="currentColor" strokeWidth="2"/><circle cx="32" cy="32" r="6" stroke="currentColor" strokeWidth="2"/><path d="m30 32 1.5 1.5 3-3" stroke="currentColor" strokeWidth="1.5"/></svg><h2>Nothing tracked yet</h2><p>Send an email from Gmail with Eseen turned on and it will appear here.</p><button className="primary-btn" onClick={onOpenGmail}>Open Gmail</button><span className="tagline">Know when it's seen.</span></div>; }
function EmptySearch({ query, onClear }: { query: string; onClear: () => void }) { return <div className="empty"><h2>No emails match “{query}”</h2><button className="link-btn" onClick={onClear}>Clear filters</button></div>; }
function ErrorState({ onRetry }: { onRetry: () => void }) { return <div className="error"><h2>Can't reach your tracking service</h2><p>Your activity is unavailable, not empty. Check that the local backend is running.</p><button className="primary-btn" onClick={onRetry}>Try again</button></div>; }
function StatTile({ label, value }: { label: string; value: ReactNode }) { return <div className="stat"><strong>{value}</strong><span>{label}</span></div>; }
function SegmentedControl<T extends string>({ options, value, onChange }: { options: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) { return <div className="segments" role="group" aria-label="Filter tracked emails">{options.map((o) => <button key={o.value} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.label}{o.count !== undefined && <span>{o.count}</span>}</button>)}</div>; }

function EmailRow({ row, query, expanded, onToggle, onKeyDown }: { row: Row; query: string; expanded: boolean; onToggle: () => void; onKeyDown: (e: React.KeyboardEvent) => void }) {
  const primary = row.recipients[0]; const status = mapStatus(primary?.status);
  const identity = primary?.name || primary?.email;
  const recipientText = identity ? (row.recipients.length > 1 ? `${identity} +${row.recipients.length - 1}` : identity) : "All recipients";
  const sub = primary?.firstOpenedAt ? `Opened ${relativeTime(primary.firstOpenedAt)}` : primary?.openCount ? `${primary.openCount} ${primary.openCount === 1 ? "open" : "opens"}` : "";
  return <>
    <button className="email-row" aria-expanded={expanded} onClick={onToggle} onKeyDown={onKeyDown}>
      <Avatar recipients={row.recipients}/>
      <div className="email-main"><div className="email-title"><Highlight text={titleFor(row)} query={query}/></div><div className="email-meta">To <Highlight text={recipientText} query={query}/> · Sent {new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(row.sentAt))}</div></div>
      <div className="email-side"><StatusPill status={status}/><span className="sub-status">{sub}</span></div>
    </button>
    <div className={`timeline ${expanded ? "open" : ""}`} aria-hidden={!expanded}>{expanded && row.recipients.map((r, i) => <div className="timeline-item" key={r.email || r.name || r.label || i}><StatusPill status={mapStatus(r.status)}/><div className="timeline-meta">{r.name || r.email || (row.mode === "combined" ? "All recipients (one shared status)" : r.label)}{r.firstOpenedAt ? ` · First ${exactTime(r.firstOpenedAt)}` : ""}{r.lastOpenedAt ? ` · Last ${exactTime(r.lastOpenedAt)}` : ""}{r.openCount ? ` · ${r.openCount} ${r.openCount === 1 ? "open" : "opens"}` : ""}{r.uaFamily ? ` · ${r.uaFamily}` : ""}</div></div>)}{expanded && primary?.threadUrl && <button className="open-gmail" onClick={() => chrome.tabs.create({ url: primary.threadUrl })}>Open in Gmail <ExternalLink size={12} aria-hidden="true"/></button>}</div>
  </>;
}

const connMeta: Record<Connection, { cls: string; text: string; title: string }> = {
  prototype: { cls: "offline", text: "Demo", title: "Demo data — not connected to a live account" },
  api: { cls: "api", text: "Local API", title: "Local API reachable — no verified account sign-in yet" },
  offline: { cls: "offline", text: "Offline", title: "Can't reach the tracking service" },
};
function Header({ connection, onSettings }: { connection: Connection; onSettings: () => void }) { const m = connMeta[connection]; return <header className="app-header"><div className="brand"><Mark/><h1>Eseen</h1></div><div className="header-actions"><span className={`status-dot ${m.cls}`} title={m.title}/><span className="status-label" title={m.title}>{m.text}</span><button className="icon-btn" onClick={onSettings} aria-label="Settings"><Settings size={16}/></button></div></header>; }
function SearchField({ value, onChange }: { value: string; onChange: (v: string) => void }) { const ref = useRef<HTMLInputElement>(null); useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === "/" && document.activeElement?.tagName !== "INPUT") { e.preventDefault(); ref.current?.focus(); } if (e.key === "Escape" && document.activeElement === ref.current) onChange(""); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onChange]); return <div className="search"><Search size={16} aria-hidden="true"/><input ref={ref} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Search by recipient or subject" aria-label="Search tracked emails"/>{value && <button onClick={() => onChange("")} aria-label="Clear search"><X size={14}/></button>}</div>; }

function Switch({ checked, onChange, label, help, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; help?: string; disabled?: boolean }) { return <div className="setting-row"><div><div className="setting-label">{label}</div>{help && <div className="setting-help">{help}</div>}</div><button className="switch" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}/></div>; }

export function SettingsPanel({ prefs, onPrefs, dataActions, onClose, onDownload, onDelete }: { prefs: Prefs; onPrefs: (p: Partial<Prefs>) => void; dataActions: boolean; onClose: () => void; onDownload?: () => void; onDelete?: () => void }) {
  const [confirm, setConfirm] = useState(false), [text, setText] = useState("");
  return <div className="settings-panel"><div className="settings-header"><button className="icon-btn" onClick={onClose} aria-label="Back"><ChevronLeft size={16}/></button><h2>Settings</h2></div><div className="settings-body">
    <Switch checked={prefs.enabled} label="Tracking on by default" onChange={(v) => onPrefs({ enabled: v })}/>
    <Switch checked={prefs.showAuto} label="Show auto-loaded opens" help="Off hides possible machine opens from the list" onChange={(v) => onPrefs({ showAuto: v })}/>
    <Switch checked={prefs.storeSubjects} label="Store email subjects" help="Off = privacy mode; subjects never leave Gmail" onChange={(v) => onPrefs({ storeSubjects: v })}/>
    <Switch checked={prefs.notifications} label="Desktop notifications" disabled help="Not available yet — notifications ship in a later phase" onChange={() => {}}/>
    <Switch checked={prefs.notifyFirstOpen} label="Notify only on first open" disabled help="Not available yet — notifications ship in a later phase" onChange={() => {}}/>
    <div className="setting-row"><div><div className="setting-label">Dark mode</div></div><div className="segmented-mode">{(["system", "light", "dark"] as Theme[]).map((t) => <button key={t} aria-pressed={prefs.theme === t} onClick={() => onPrefs({ theme: t })}>{t === "system" ? <Monitor size={12}/> : t === "light" ? <Sun size={12}/> : <Moon size={12}/>} {t}</button>)}</div></div>
    <div className="danger-zone"><div className="setting-row"><button className="secondary-btn" disabled={!dataActions} onClick={onDownload}><Download size={12}/> Download my data</button><button className="danger-btn" disabled={!dataActions} onClick={() => setConfirm(true)}><Trash2 size={12}/> Delete all my data</button></div>
    {!dataActions && <div className="data-note">Available when connected to the local API — this is demo data.</div>}</div>
    <div className="version">Eseen prototype · local development</div></div>
    {confirm && <div className="confirm-overlay"><div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-title"><h3 id="delete-title">Delete all data?</h3><p>This cannot be undone. Type DELETE to confirm.</p><input value={text} onChange={(e) => setText(e.target.value)} placeholder="DELETE"/><button className="secondary-btn" onClick={() => setConfirm(false)}>Cancel</button> <button className="danger-btn" disabled={text !== "DELETE"} onClick={() => { onDelete?.(); setConfirm(false); }}>Delete</button></div></div>}</div>;
}

export function App({ rows, demo, connection = "prototype", onDownload, onDelete }: { rows: Row[]; demo?: boolean; connection?: Connection; onDownload?: () => void; onDelete?: () => void }) {
  const [prefs, updatePrefs] = usePrefs();
  const [query, setQuery] = useState(""), [debounced, setDebounced] = useState(""), [filter, setFilter] = useState<Filter>("ALL"), [expanded, setExpanded] = useState<string | null>(null), [settings, setSettings] = useState(false), [announce, setAnnounce] = useState("");
  useEffect(() => { const t = setTimeout(() => setDebounced(query), 120); return () => clearTimeout(t); }, [query]);
  const visible = prefs.showAuto ? rows : rows.filter((r) => mapStatus(r.recipients[0]?.status) !== "possible");
  const counts = { ALL: visible.length, OPENED: visible.filter((r) => mapStatus(r.recipients[0]?.status) === "opened").length, NOT_OPENED: visible.filter((r) => mapStatus(r.recipients[0]?.status) !== "opened").length, AUTO: visible.filter((r) => mapStatus(r.recipients[0]?.status) === "possible").length };
  const shown = visible.filter((row) => { const status = mapStatus(row.recipients[0]?.status); if (filter === "OPENED" && status !== "opened") return false; if (filter === "NOT_OPENED" && status === "opened") return false; if (filter === "AUTO" && status !== "possible") return false; if (!debounced) return true; const q = debounced.toLowerCase(); return titleFor(row).toLowerCase().includes(q) || row.recipients.some((r) => (r.email || r.name || r.label || "").toLowerCase().includes(q)); }).slice(0, 25);
  const today = visible.filter((r) => new Date(r.sentAt).toDateString() === new Date().toDateString()); const openedToday = today.filter((r) => mapStatus(r.recipients[0]?.status) === "opened"); const rate = today.length ? Math.round((openedToday.length / today.length) * 100) : 0;
  const openGmail = () => chrome.tabs.create({ url: "https://mail.google.com" });
  const conn: Connection = demo ? "prototype" : connection;
  if (demo) return <Demo />;
  const filterOptions: { value: Filter; label: string; count: number }[] = [{ value: "ALL", label: "All", count: counts.ALL }, { value: "OPENED", label: "Opened", count: counts.OPENED }, { value: "NOT_OPENED", label: "Not opened", count: counts.NOT_OPENED }];
  if (prefs.showAuto) filterOptions.push({ value: "AUTO", label: "Auto", count: counts.AUTO });
  return <main data-theme={prefs.theme === "system" ? undefined : prefs.theme}><Header connection={conn} onSettings={() => setSettings(true)}/><div className="summary"><StatTile label="Tracked today" value={today.length}/><StatTile label="Opened" value={openedToday.length}/><StatTile label="Open rate" value={`${rate}%`}/></div><div className="controls"><SearchField value={query} onChange={setQuery}/><SegmentedControl value={filter} onChange={setFilter} options={filterOptions}/></div><div className="list-scroll">{shown.length === 0 ? (query || filter !== "ALL" ? <EmptySearch query={query || "opened"} onClear={() => { setQuery(""); setFilter("ALL"); }}/> : <EmptyState onOpenGmail={openGmail}/>) : <ul>{shown.map((row) => <li key={row.id}><EmailRow row={row} query={debounced} expanded={expanded === row.id} onToggle={() => { const next = expanded === row.id ? null : row.id; setExpanded(next); setAnnounce(next ? "Details expanded" : "Details collapsed"); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); const next = expanded === row.id ? null : row.id; setExpanded(next); setAnnounce(next ? "Details expanded" : "Details collapsed"); } if (e.key === "Escape") setExpanded(null); }}/></li>)}</ul>}</div><footer className="footer"><span>{conn === "prototype" ? "Demo data — not a live inbox" : "Local API — no account sign-in"}</span><span>Showing last 25</span></footer>{settings && <SettingsPanel prefs={prefs} onPrefs={updatePrefs} dataActions={conn === "api"} onClose={() => setSettings(false)} onDownload={onDownload} onDelete={onDelete}/>}<div className="announcer" aria-live="polite">{announce}</div></main>;
}

const API = (import.meta.env.VITE_ESEEN_API as string | undefined) ?? "http://localhost:8787"; // dev default; production URL set at build/deploy, never silently
function Root() {
  const [rows, setRows] = useState<Row[] | null>(null), [error, setError] = useState(false), [attempt, setAttempt] = useState(0);
  useEffect(() => { let active = true; setError(false);
    chrome.storage.sync.get({ userId: "dev-user", showAuto: true }).then(async (s) => {
      try { const r = await fetch(`${API}/v1/messages?limit=25&showAuto=${s.showAuto}`, { headers: { authorization: `Bearer ${s.userId}` } }); if (!r.ok) throw Error("Unavailable"); const data = await r.json(); if (!Array.isArray(data)) throw Error("Invalid"); if (active) setRows(data); }
      catch { if (active) setError(true); }
    });
    return () => { active = false; };
  }, [attempt]);
  const withAuth = async (fn: (userId: string) => Promise<void>) => { const s = await chrome.storage.sync.get({ userId: "dev-user" }); try { await fn(s.userId); } catch { setError(true); } };
  if (error) return <main><ErrorState onRetry={() => setAttempt((a) => a + 1)}/></main>;
  if (!rows) return <main><Header connection="offline" onSettings={() => {}}/><SkeletonRows/></main>;
  return <App rows={rows} connection="api"
    onDownload={() => void withAuth(async (u) => { const r = await fetch(`${API}/v1/export`, { headers: { authorization: `Bearer ${u}` } }); if (!r.ok) throw Error("Unavailable"); const blob = await r.blob(); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "eseen-export.json"; a.click(); URL.revokeObjectURL(url); })}
    onDelete={() => void withAuth(async (u) => { const r = await fetch(`${API}/v1/me`, { method: "DELETE", headers: { authorization: `Bearer ${u}` } }); if (!r.ok) throw Error("Unavailable"); setAttempt((a) => a + 1); })}/>;
}
function Demo() { const now = Date.now(); const rows: Row[] = [{ id: "1", subject: "Proposal v2", sentAt: now - 12 * 60_000, mode: "combined", recipients: [{ status: "OPENED", label: "Opened", tooltip: "", openCount: 3, firstOpenedAt: now - 12 * 60_000, uaFamily: "Desktop" }] }, { id: "2", label: "Intro follow-up", sentAt: now - 3 * 3_600_000, mode: "combined", recipients: [{ status: "POSSIBLY_OPENED", label: "Auto-loaded", tooltip: "", openCount: 1, firstOpenedAt: now - 3 * 3_600_000 }] }, { id: "3", sentAt: now - 86_400_000, mode: "combined", recipients: [{ status: "NOT_OPENED_YET", label: "Not opened", tooltip: "", openCount: 0 }] }]; return <App rows={rows} connection="prototype"/>; }
const el = typeof document !== "undefined" && document.getElementById("root");
if (el) { const demo = new URLSearchParams(location.search).has("demo"); createRoot(el).render(demo ? <Demo/> : <Root/>); }
