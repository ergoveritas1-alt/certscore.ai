/** Closed, retained page templates. A phrase in an article or a successful
 * transport alone is not a page-state observation. No browser work is added. */
export function classifyRuntimeErrorPage(text: string | null | undefined):
  "not_found_404" | "maintenance_or_unavailable" | "unsupported_region" | "redirect_only_page" | "captcha_or_challenge" | undefined {
  if (!text) return undefined;
  const bounded = text.slice(0, 4096).replace(/\s+/g, " ").trim();
  if (text.length <= 256 && /^Verifying your browser before proceeding\.\.\.\s+Incident ID: [a-z0-9-]{1,160}$/i.test(bounded)) {
    return "captcha_or_challenge";
  }
  if (text.length <= 2048 && /^We apologize for the inconvenience\.\.\. \.\.\.but your activity and behavior on this site made us think that you are a bot\. Note: A number of things could be going on here\. If you are attempting to access this site using an anonymous Private\/Proxy network, please disable that and try accessing site again\. Due to previously detected malicious behavior which originated from the network you're using, please request unblock to site\. Incident ID: [a-z0-9-]{1,160} Please solve this CAPTCHA to request unblock to the website(?: You reached this page when trying to access https?:\/\/[^\s]+ from (?:\d{1,3}\.){3}\d{1,3} on [A-Za-z]{3,12} \d{1,2} \d{4}, \d{2}:\d{2}:\d{2} UTC)?$/i.test(bounded)) {
    return "captcha_or_challenge";
  }
  if (text.length <= 1024 && /^Please confirm that you are not a robot We're sorry, but it looks like requests sent from your device are automated\. Why might this happen\? I'm not a robot Press to continue Yandex SmartCaptcha If you have any problems, please use the feedback form \d{1,32}:\d{1,16}(?: Yandex uses cookies They ensure the smooth operation of all Yandex sites and services\. For more information, please read our Cookie Policy Allow all Allow essential cookies Settings)?$/.test(bounded)) {
    return "captcha_or_challenge";
  }
  // A complete redirect notice is not the destination page. Do not infer a
  // redirect from a link, a quoted instruction, or a substantive page with one.
  const redirect = text.length <= 512 && /^You will be automatically re-directed to our consumer site momentarily, or you may navigate to [\p{L}\p{N} &'’-]{1,100} content at our new location by following this link:\s+(https?:\/\/[^\s]+)$/u.exec(bounded);
  if (redirect) {
    try {
      const destination = new URL(redirect[1]!);
      if (!destination.username && !destination.password && destination.hostname) return "redirect_only_page";
    } catch { /* An invalid link cannot establish this complete page template. */ }
  }
  if (text.length <= 256 && /^OOPS!!!\s+WE ARE CURRENTLY NOT AVAILABLE IN YOUR REGION\.$/i.test(bounded)) {
    return "unsupported_region";
  }
  const soft404 = /\b404\s*\|?\s*OOPS! WE['’]RE SORRY\.\s+This page doesn['’]t exist, or you can['’]t access it\.\s+Main Page\s*\|\s*Your Apps\s*\|\s*Help Center\s*\|\s*Resources\b/i.exec(bounded);
  if (soft404) {
    const prefix = bounded.slice(0, soft404.index);
    // The reviewed shell has navigation before its error heading. Quoted
    // examples and explanatory prose must not borrow that heading as page state.
    if (prefix.length <= 1024 && !/[.:!?"'‘’“”`]/u.test(prefix) &&
        !/\b(?:example|sample|guide|tutorial|troubleshooting)\b/i.test(prefix)) return "not_found_404";
  }
  if (/^(?:Skip to main content\s+)?Temporary service interruption\s+Our systems are currently overloaded\. To protect your data, we['’]ve paused this feature\.\s+Refresh(?:\s+[\ue000-\uf8ff]\s+(?:Download|Notifications|Chats|Feedback)){0,4}$/i.test(bounded)) {
    return "maintenance_or_unavailable";
  }
  return undefined;
}
