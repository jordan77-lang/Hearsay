// Modal for Supabase URL + anon key (stored in browser localStorage).

/**
 * @param {{ url?: string, anonKey?: string, onSave: (cfg: { url: string, anonKey: string }) => void, onClear?: () => void }} opts
 */
export function openCloudSettingsModal({ url = "", anonKey = "", onSave, onClear }) {
  const overlay = document.createElement("div");
  overlay.className = "ss-modal-overlay";
  overlay.innerHTML = `
    <div class="ss-modal ss-cloud-modal" role="dialog" aria-modal="true" aria-labelledby="ss-cloud-title">
      <h2 id="ss-cloud-title" class="ss-title" style="font-size:16px;margin:0 0 6px">Cloud dictionary</h2>
      <p class="ss-sub" style="margin:0 0 14px">Connect to your Supabase project. Credentials stay in this browser only.</p>
      <label class="ss-frac-label" for="ss-cloud-url">Project URL</label>
      <input id="ss-cloud-url" class="ss-input ss-frac-input" type="url" spellcheck="false"
        placeholder="https://xxxx.supabase.co" autocomplete="off" />
      <label class="ss-frac-label" for="ss-cloud-key" style="margin-top:10px">Anon (public) key</label>
      <input id="ss-cloud-key" class="ss-input ss-frac-input" type="password" spellcheck="false"
        placeholder="eyJ…" autocomplete="off" />
      <p class="ss-frac-error hidden" id="ss-cloud-error" role="alert"></p>
      <div class="ss-modal-actions">
        <button type="button" class="ss-btn" id="ss-cloud-clear">Clear saved</button>
        <button type="button" class="ss-btn" id="ss-cloud-cancel">Cancel</button>
        <button type="button" class="ss-btn primary" id="ss-cloud-save">Save &amp; connect</button>
      </div>
    </div>`;

  const urlInput = overlay.querySelector("#ss-cloud-url");
  const keyInput = overlay.querySelector("#ss-cloud-key");
  const errorEl = overlay.querySelector("#ss-cloud-error");
  urlInput.value = url;
  keyInput.value = anonKey;

  function close() {
    overlay.remove();
  }

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.toggle("hidden", !msg);
  }

  overlay.querySelector("#ss-cloud-cancel").addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  overlay.querySelector("#ss-cloud-clear").addEventListener("click", () => {
    onClear?.();
    close();
  });

  overlay.querySelector("#ss-cloud-save").addEventListener("click", () => {
    const nextUrl = urlInput.value.trim().replace(/\/+$/, "");
    const nextKey = keyInput.value.trim();
    if (!nextUrl || !nextKey) {
      showError("Project URL and anon key are both required.");
      return;
    }
    if (!/^https?:\/\//i.test(nextUrl)) {
      showError("Project URL should start with https://");
      return;
    }
    onSave({ url: nextUrl, anonKey: nextKey });
    close();
  });

  keyInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") overlay.querySelector("#ss-cloud-save").click();
  });

  document.body.appendChild(overlay);
  urlInput.focus();
}
