import { buildApp } from "./app.js";
import { PgStore } from "./pgstore.js";
import pg from "pg";
const secrets = (process.env.ESEEN_SECRETS ?? "").split(",").filter(Boolean);
if (!secrets.length) { console.error("Set ESEEN_SECRETS (comma separated, first signs). Refusing to start."); process.exit(1); }
// Durable storage when DATABASE_URL is set (Postgres); otherwise the in-memory dev store (state lost on restart).
const store = process.env.DATABASE_URL ? await PgStore.connect(new pg.Pool({ connectionString: process.env.DATABASE_URL })) : undefined;
const { app } = buildApp({ secrets, baseUrl: process.env.BASE_URL ?? "http://localhost:8787", ...(store ? { store } : {}) });
app.listen({ port: Number(process.env.PORT ?? 8787), host: "0.0.0.0" });
