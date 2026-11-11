/** Gmail selectors. UNVERIFIED against live Gmail in this build: kept in one place so they can be swapped via remote config. */
export const selectors = {
  composeBody: 'div[aria-label="Message Body"][contenteditable="true"], div[g_editable="true"][role="textbox"]',
  sendButton: 'div[role="button"][data-tooltip^="Send"], div[role="button"][aria-label^="Send"]',
  composeRoot: 'div[role="dialog"], form.bAs',
  recipientChips: 'input[name="to"], input[name="cc"], input[name="bcc"]',
};
export type Selectors = typeof selectors;
