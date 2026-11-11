import React from "react";
import { createRoot } from "react-dom/client";
import { App, type Row } from "./main";
import "./popup.css";
const now = Date.now();
// Combined mode knows no individual recipient identity: rows carry no name/email on purpose.
const base: Row = { id: "base", subject: "Proposal v2", sentAt: now - 12 * 60_000, mode: "combined", recipients: [{ status: "OPENED", label: "Opened", tooltip: "The tracking image loaded. This does not prove the email was read.", openCount: 2, firstOpenedAt: now - 10 * 60_000, lastOpenedAt: now - 2 * 60_000, uaFamily: "Desktop" }] };
const states: Row[][] = [[base], [{ ...base, id: "possible", subject: "Intro follow-up", recipients: [{ status: "POSSIBLY_OPENED", label: "Auto-loaded", tooltip: "This open may have been triggered by Apple Mail Privacy Protection or a security scanner.", openCount: 1, firstOpenedAt: now - 3600000 }] }], [{ ...base, id: "pending", subject: "Pricing question", sentAt: now - 86400000, recipients: [{ status: "SENT", label: "Sent", tooltip: "Email sent, no events yet.", openCount: 0 }] }], [{ ...base, id: "none", subject: "Catch up next week?", sentAt: now - 86400000, recipients: [{ status: "NOT_OPENED_YET", label: "Not opened", tooltip: "No open detected. The recipient may have images blocked.", openCount: 0 }] }], []];
const el = document.getElementById("root")!;
createRoot(el).render(<div style={{ display: "grid", gap: 24 }}>{states.map((rows, i) => <div key={i} style={{ width: 380, height: 560, border: "1px solid #ccc", overflow: "hidden", position: "relative" }}><App rows={rows}/></div>)}</div>);
