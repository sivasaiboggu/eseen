import "../popup/tokens.css";
import "./onboarding.css";
const ack = document.getElementById("ack") as HTMLInputElement;
const go = document.getElementById("go") as HTMLButtonElement;
const later = document.getElementById("later") as HTMLButtonElement;
ack.addEventListener("change", () => { go.disabled = !ack.checked; });
const done = async (openGmail: boolean) => {
  await chrome.storage.sync.set({ onboarded: true });
  if (openGmail) chrome.tabs.create({ url: "https://mail.google.com/" });
  window.close();
};
go.addEventListener("click", () => void done(true));
later.addEventListener("click", () => void done(false));
