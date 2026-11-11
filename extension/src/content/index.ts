import { selectors } from "./selectors";
import { removePixel, readRecipients } from "./inject";
import { prepareSend } from "./tracking";
import { startInboxSdk } from "./inboxsdk";

const API = (import.meta.env.VITE_ESEEN_API as string | undefined) ?? "http://localhost:8787"; // dev only; production URL set at build/deploy, never silently
const wired = new WeakSet<Element>(), bypass = new WeakSet<Element>();
type S = { enabled: boolean; userId: string; storeSubjects?: boolean };
const settings = () => chrome.storage.sync.get({ enabled: true, userId: "dev-user", storeSubjects: false }) as Promise<S>;

function banner(text: string) { // fail safely: small notice, never break Gmail
  if (document.getElementById("eseen-banner")) return;
  const h = document.createElement("div"); h.id = "eseen-banner"; h.style.cssText = "position:fixed;bottom:8px;left:8px;z-index:2147483647";
  const r = h.attachShadow({ mode: "open" }); r.innerHTML = `<div role="status" style="font:12px system-ui;background:#4f46e5;color:#fff;padding:6px 10px;border-radius:8px"></div>`; (r.firstElementChild as HTMLElement).textContent = text;
  document.body.appendChild(h); setTimeout(() => h.remove(), 8000);
}

function addToggle(send: Element, on: boolean, body: HTMLElement) {
  const host = document.createElement("span"); host.style.cssText = "display:inline-block;margin-right:8px;vertical-align:middle";
  const root = host.attachShadow({ mode: "open" }); // isolate from Gmail CSS
  root.innerHTML = `<style>label{font:12px system-ui;color:#4f46e5;cursor:pointer;display:inline-flex;gap:4px;align-items:center}.e{display:none}input:checked~.e{display:inline}</style><label><input type="checkbox" ${on ? "checked" : ""} aria-label="Track this email with Eseen"><span class="e" aria-hidden="true">\u{1F441}</span> Eseen</label>`;
  const box = root.querySelector("input")!;
  box.addEventListener("change", () => { chrome.storage.sync.set({ enabled: box.checked }); if (!box.checked) removePixel(body); });
  send.parentElement?.insertBefore(host, send);
  return box;
}

function wire(root: Element) {
  if (wired.has(root)) return;
  const send = root.querySelector(selectors.sendButton), body = root.querySelector<HTMLElement>(selectors.composeBody);
  if (!send || !body) return;
  wired.add(root);
  settings().then((s) => {
    const toggle = addToggle(send, s.enabled, body);
    // capture phase: the pixel must be in the body before Gmail serialises it
    send.addEventListener("click", async (ev) => {
      if (bypass.has(send)) { bypass.delete(send); return; }
      if (!toggle.checked) return;
      ev.stopImmediatePropagation(); ev.preventDefault(); // hold the send until tracking exists or the user decides
      const cfg = await settings();
      const recips = readRecipients(root).map((x) => x.email);
      const subject = cfg.storeSubjects ? (root.querySelector<HTMLInputElement>(selectors.subjectInput)?.value || undefined) : undefined; // subjects stay in Gmail unless the user opts in
      const res = await prepareSend(body, { base: API, userId: cfg.userId }, recips, () => window.confirm("Eseen couldn't set up tracking. Send without tracking?"), subject);
      if (res === "cancel") return;
      bypass.add(send); send.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); // resume the held send
    }, true);
  });
}
const APP_ID = import.meta.env.VITE_INBOXSDK_APP_ID as string | undefined;
if (APP_ID) {
  startInboxSdk(APP_ID, async () => ({ base: API, userId: (await settings()).userId }), async () => (await settings()).enabled, (v) => void chrome.storage.sync.set({ enabled: v }))
    .catch(() => banner("Eseen needs an update"));
} else {
let t: number | undefined;
const scan = () => { try { document.querySelectorAll(selectors.composeRoot).forEach(wire); } catch { banner("Eseen needs an update"); } };
scan(); // initial pass: a static compose (or one opened before idle) has no mutation to trigger the observer
new MutationObserver(() => { clearTimeout(t); t = window.setTimeout(scan, 200); }).observe(document.body, { childList: true, subtree: true });
}
