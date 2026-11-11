import { defineManifest } from "@crxjs/vite-plugin";
export default defineManifest({
  manifest_version: 3, name: "Eseen", version: "0.1.0",
  description: "Honest email open and click tracking for Gmail.",
  permissions: ["storage", "identity", "notifications", "alarms"],
  host_permissions: ["https://mail.google.com/*"],
  content_scripts: [{ matches: ["https://mail.google.com/*"], js: ["src/content/index.ts"], run_at: "document_idle" }],
  action: { default_popup: "src/popup/index.html" },
  content_security_policy: { extension_pages: "script-src 'self'; object-src 'self'" },
});
