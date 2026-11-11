// Required by InboxSDK under MV3: injects its page-world script via chrome.scripting.
import "@inboxsdk/core/background.js";
import { checkOnce, type NotifyPrefs } from "./notify";
import { flushQueue } from "../content/queue";

const API = (import.meta.env.VITE_ESEEN_API as string | undefined) ?? "http://localhost:8787"; // dev default; production URL set at build/deploy
async function tick() {
  const s = (await chrome.storage.sync.get({ userId: "dev-user", notifications: false, notifyFirstOpen: false, showAuto: true, onboarded: false, google: null as { idToken: string; expiresAt: number } | null })) as { userId: string; onboarded: boolean; google: { idToken: string; expiresAt: number } | null } & NotifyPrefs;
  if (!s.onboarded) return; // consent gate: no queue flush or open-polling before onboarding
  // Fail closed: when a Google client ID is configured at build time, only a valid Google session talks to the API;
  // the dev identity exists only for explicitly local builds. An expired session is cleared so the popup prompts sign-in.
  const googleMode = !!(import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined);
  let bearer: string;
  if (googleMode) {
    if (!s.google || s.google.expiresAt <= Date.now()) { if (s.google) await chrome.storage.sync.set({ google: null }); return; }
    bearer = s.google.idToken;
  } else bearer = s.userId;
  const seen = (await chrome.storage.local.get({ seen: {} })).seen as Record<string, number>;
  await flushQueue({ base: API, userId: bearer }); // retry queued self-view/sent-ack signals
  const next = await checkOnce({ base: API, userId: bearer }, s, seen, (title, message) => { try { chrome.notifications.create({ type: "basic", iconUrl: "icons/icon128.png", title, message }); } catch { /* headless/dev */ } });
  await chrome.storage.local.set({ seen: next });
}
// First run: show the onboarding/consent page once.
chrome.runtime.onInstalled.addListener((d) => {
  if (d.reason !== "install") return;
  void chrome.storage.sync.get({ onboarded: false }).then((v) => {
    if (!v.onboarded) chrome.tabs.create({ url: chrome.runtime.getURL("src/onboarding/index.html") });
  });
});
chrome.alarms.create("eseen-poll", { periodInMinutes: 1 }); // the backend is the extension's own service, not a third-party site
chrome.alarms.onAlarm.addListener((a) => { if (a.name === "eseen-poll") void tick(); });
(self as unknown as { __eseenTick?: unknown }).__eseenTick = tick; // test hook
