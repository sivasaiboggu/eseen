import { defineManifest } from "@crxjs/vite-plugin";
export default defineManifest({
  manifest_version: 3, name: "Eseen", version: "0.1.0",
  description: "Honest email open and click tracking for Gmail.",
  permissions: ["storage", "identity", "notifications", "alarms", "scripting"],
  host_permissions: ["https://mail.google.com/*", "http://localhost:8787/*"], // localhost: dev API only; production URL replaces it at deploy
  content_scripts: [{ matches: ["https://mail.google.com/*"], js: ["src/content/index.ts"], run_at: "document_idle" }],
  background: { service_worker: "src/background/index.ts", type: "module" },
  icons: { 16: "icons/icon16.png", 32: "icons/icon32.png", 48: "icons/icon48.png", 128: "icons/icon128.png" },
  web_accessible_resources: [{ resources: ["icons/*"], matches: ["https://mail.google.com/*"] }],
  action: { default_popup: "src/popup/index.html" },
  content_security_policy: { extension_pages: "script-src 'self'; object-src 'self'" },
});
