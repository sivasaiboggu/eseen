import * as InboxSDK from "@inboxsdk/core";
import { removePixel } from "./inject";
import { prepareSend, type Api } from "./tracking";

/** Primary Gmail integration. Needs a free InboxSDK AppId registered by the project owner (VITE_INBOXSDK_APP_ID). Not tested against live Gmail. */
export async function startInboxSdk(appId: string, getApi: () => Promise<Api>, getEnabled: () => Promise<boolean>, setEnabled: (v: boolean) => void) {
  const sdk = await InboxSDK.load(2, appId);
  sdk.Compose.registerComposeViewHandler((cv) => {
    let on = true; getEnabled().then((v) => (on = v));
    const body = () => cv.getBodyElement();
    let bypass = false;
    cv.addButton({
      title: "Eseen: track opens", iconUrl: chrome.runtime.getURL("icons/icon32.png"), orderHint: 1,
      onClick() { on = !on; setEnabled(on); if (!on) removePixel(body()); },
    });
    // presending is synchronous: cancel, set up tracking, then resume with send()
    cv.on("presending", (ev) => {
      if (bypass) { bypass = false; return; }
      if (!on) return;
      ev.cancel();
      (async () => {
        const api = await getApi();
        const recips = [...cv.getToRecipients(), ...cv.getCcRecipients(), ...cv.getBccRecipients()].map((c) => c.emailAddress);
        const res = await prepareSend(body(), api, recips, () => window.confirm("Eseen couldn't set up tracking. Send without tracking?"));
        if (res === "cancel") return;
        bypass = true; cv.send();
      })();
    });
    cv.on("discard", () => removePixel(body())); // no orphan pixels in discarded drafts
  });
}
