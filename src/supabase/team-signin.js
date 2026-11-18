// "Team password" dialog. The team account's email is built in and never shown
// or editable; authors only type the password.
import { signInTeam } from "./team-auth.js";
import { TEAM_EMAIL } from "./team-config.js";

/**
 * Ask for the team password and sign in.
 * @param {{ config: { url: string, anonKey: string }, reason?: string }} opts
 * @returns {Promise<boolean>} true once signed in, false if cancelled
 */
export function openTeamSignIn({ config, reason = "" } = {}) {
  return new Promise(resolve => {
    const overlay = document.createElement("div");
    overlay.className = "ss-modal-overlay";
    overlay.innerHTML = `
      <form class="ss-modal ss-cloud-modal" role="dialog" aria-modal="true" aria-labelledby="hs-team-title" id="hs-team-form">
        <h2 id="hs-team-title" class="ss-title" style="font-size:16px;margin:0 0 6px">Team sign-in</h2>
        <p class="ss-sub" style="margin:0 0 14px" id="hs-team-why"></p>
        <input type="text" name="username" autocomplete="username" value="${TEAM_EMAIL}" readonly hidden />
        <label class="ss-frac-label" for="hs-team-password">Team password</label>
        <input id="hs-team-password" class="ss-input ss-frac-input" type="password" autocomplete="current-password" required />
        <p class="ss-frac-error hidden" id="hs-team-error" role="alert"></p>
        <div class="ss-modal-actions">
          <button type="button" class="ss-btn" id="hs-team-cancel">Cancel</button>
          <button type="submit" class="ss-btn primary" id="hs-team-submit">Sign in</button>
        </div>
      </form>`;
    const $ = id => overlay.querySelector(`#${id}`);
    $("hs-team-why").textContent = reason || "Enter the team password to edit and save class dictionaries. Anyone can listen and review without it.";
    let settled = false;
    function close(result) { if (settled) return; settled = true; overlay.remove(); resolve(result); }
    function error(message) { $("hs-team-error").textContent = message; $("hs-team-error").classList.toggle("hidden", !message); }
    $("hs-team-cancel").addEventListener("click", () => close(false));
    overlay.addEventListener("click", event => { if (event.target === overlay) close(false); });
    overlay.addEventListener("keydown", event => { if (event.key === "Escape") { event.stopPropagation(); close(false); } });
    $("hs-team-form").addEventListener("submit", async event => {
      event.preventDefault();
      const password = $("hs-team-password").value;
      if (!password) return error("Enter the team password.");
      $("hs-team-submit").disabled = true; error("");
      try { await signInTeam(config, password); close(true); }
      catch (failure) { error(failure.message); $("hs-team-submit").disabled = false; $("hs-team-password").select?.(); }
    });
    document.body.appendChild(overlay);
    $("hs-team-password").focus();
  });
}
