import { buildApp } from "./app.js";
import { PgStore } from "./pgstore.js";
import { googleAuth } from "./googleauth.js";
import pg from "pg";
const secrets = (process.env.ESEEN_SECRETS ?? "").split(",").filter(Boolean);
if (!secrets.length) { console.error("Set ESEEN_SECRETS (comma separated, first signs). Refusing to start."); process.exit(1); }
// Durable storage when DATABASE_URL is set (Postgres); otherwise the in-memory dev store (state lost on restart).
// AES-256-GCM at-rest key for opt-in subject/label columns; without it those columns are stored unencrypted (log a loud warning).
const dataKey = process.env.ESEEN_DATA_KEY ? Buffer.from(process.env.ESEEN_DATA_KEY, "base64") : undefined;
const store = process.env.DATABASE_URL ? await PgStore.connect(new pg.Pool({ connectionString: process.env.DATABASE_URL }), { dataKey, requireKey: true }) : undefined; // production fails closed: no valid data key, no startup
// Verified Google identity when the project owner's OAuth client ID is configured: dev bearer auth is then DISABLED.
const verifyGoogle = process.env.ESEEN_GOOGLE_CLIENT_ID ? googleAuth({ clientId: process.env.ESEEN_GOOGLE_CLIENT_ID }) : undefined;
const authUser = verifyGoogle ? (h: Record<string, unknown>) => { const a = String(h.authorization ?? ""); return a.startsWith("Bearer ") ? verifyGoogle(a.slice(7)) : null; } : undefined;
const { app } = buildApp({ secrets, baseUrl: process.env.BASE_URL ?? "http://localhost:8787", ...(store ? { store } : {}), ...(authUser ? { authUser } : {}) });
app.listen({ port: Number(process.env.PORT ?? 8787), host: "0.0.0.0" });
