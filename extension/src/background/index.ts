// Required by InboxSDK under MV3: injects its page-world script via chrome.scripting.
import "@inboxsdk/core/background.js";
import { checkOnce, type NotifyPrefs } from "./notify";
import { flushQueue } from "../content/queue";

const API = (import.meta.env.VITE_ESEEN_API as string | undefined) ?? "http://localhost:8787"; // dev default; production URL set at build/deploy
async function tick() {
  const s = (await chrome.storage.sync.get({ userId: "dev-user", notifications: false, notifyFirstOpen: false, showAuto: true })) as { userId: string } & NotifyPrefs;
  const seen = (await chrome.storage.local.get({ seen: {} })).seen as Record<string, number>;
  await flushQueue({ base: API, userId: s.userId }); // retry queued self-view/sent-ack signals
  const next = await checkOnce({ base: API, userId: s.userId }, s, seen, (title, message) => { try { chrome.notifications.create({ type: "basic", iconUrl: "icons/icon128.png", title, message }); } catch { /* headless/dev */ } });
  await chrome.storage.local.set({ seen: next });
}
chrome.alarms.create("eseen-poll", { periodInMinutes: 1 }); // the backend is the extension's own service, not a third-party site
chrome.alarms.onAlarm.addListener((a) => { if (a.name === "eseen-poll") void tick(); });
(self as unknown as { __eseenTick?: unknown }).__eseenTick = tick; // test hook
