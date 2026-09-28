(function runTest2Choice() {
  "use strict";
  const marker = document.body.dataset.test2ChoiceCookie;
  if (!["certscore_test2_dns_optout", "certscore_test2_optional_off"].includes(marker)) return;
  const status = document.getElementById("choice-status");
  const isActive = () => document.cookie.split(";").some((part) => part.trim() === `${marker}=1`);
  const describe = () => {
    status.textContent = isActive()
      ? "This manual choice is saved in this browser. Optional test activity will be off on the next visit."
      : "This manual choice is not saved in this browser.";
  };
  const clearTestState = () => {
    for (const name of ["_ga_TEST2", "_gat_TEST2", "_fbc", "_clsk", "ajs_anonymous_id", "mp_test2_mixpanel", "_gid", "OptanonConsent"]) {
      document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax; Secure`;
    }
    try {
      localStorage.removeItem("certscore_test2_analytics");
      localStorage.removeItem("certscore_test2_consent_state");
      sessionStorage.removeItem("certscore_test2_session_replay");
    } catch (_) { /* Storage can be unavailable in restricted browsers. */ }
  };
  document.getElementById("save-choice").addEventListener("click", () => {
    document.cookie = `${marker}=1; Max-Age=86400; Path=/; SameSite=Lax; Secure`;
    clearTestState();
    describe();
  });
  document.getElementById("reset-choice").addEventListener("click", () => {
    document.cookie = `${marker}=; Max-Age=0; Path=/; SameSite=Lax; Secure`;
    describe();
  });
  describe();
})();
