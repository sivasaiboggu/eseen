import { buildApp } from "./app.js";
const secrets = (process.env.EESEN_SECRETS ?? process.env.ESEEN_SECRETS ?? "").split(",").filter(Boolean);
if (!secrets.length) { console.error("Set ESEEN_SECRETS (comma separated, first signs). Refusing to start."); process.exit(1); }
const { app } = buildApp({ secrets, baseUrl: process.env.BASE_URL ?? "http://localhost:8787" });
app.listen({ port: Number(process.env.PORT ?? 8787), host: "0.0.0.0" });
