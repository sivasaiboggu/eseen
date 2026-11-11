/** Google sign-in via OIDC implicit id_token through chrome.identity.launchWebAuthFlow.
 * Enabled only when a project-owner-registered OAuth client ID is provided at build time
 * (VITE_GOOGLE_CLIENT_ID). The backend verifies the id_token (RS256/JWKS, iss/aud/exp). */
export const googleClientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? "";
export interface GoogleSession { idToken: string; expiresAt: number }
export const googleSignInEnabled = () => googleClientId.length > 0 && typeof chrome !== "undefined" && !!chrome.identity?.launchWebAuthFlow;

export async function signInWithGoogle(): Promise<GoogleSession> {
  const nonce = crypto.randomUUID(), state = crypto.randomUUID();
  const redirect = chrome.identity.getRedirectURL();
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(googleClientId)}&response_type=id_token&scope=${encodeURIComponent("openid email")}&redirect_uri=${encodeURIComponent(redirect)}&nonce=${encodeURIComponent(nonce)}&state=${encodeURIComponent(state)}`;
  const ret = await chrome.identity.launchWebAuthFlow({ url, interactive: true });
  if (!ret) throw new Error("Sign-in was cancelled");
  const parsed = new URL(ret), params = new URLSearchParams(parsed.hash.slice(1));
  if (params.get("state") !== state) throw new Error("State mismatch - response not from this sign-in attempt");
  const token = params.get("id_token");
  if (!token) throw new Error("No id_token in the Google response");
  const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
  if (payload.nonce !== nonce) throw new Error("Nonce mismatch");
  if (payload.aud !== googleClientId) throw new Error("Token audience mismatch");
  if (typeof payload.exp === "number" && payload.exp * 1000 <= Date.now()) throw new Error("Token already expired");
  return { idToken: token, expiresAt: (payload.exp as number) * 1000 };
}

export async function loadSession(): Promise<GoogleSession | null> {
  const v = await chrome.storage.sync.get({ google: null });
  const s = v.google as GoogleSession | null;
  if (!s || s.expiresAt < Date.now()) return null;
  return s;
}
export async function saveSession(s: GoogleSession | null) { await chrome.storage.sync.set({ google: s }); }
export async function signOut() { await saveSession(null); await chrome.identity.clearAllCachedAuthTokens().catch(() => {}); }
