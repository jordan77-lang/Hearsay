// Save a Blob as a file download (works in pages and the Chrome extension side panel).

function anchorDownload(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 2000);
}

/**
 * @param {string} filename
 * @param {Blob} blob
 * @returns {Promise<void>}
 */
export function saveBlobAsFile(filename, blob) {
  if (typeof chrome !== "undefined" && chrome.downloads?.download) {
    const url = URL.createObjectURL(blob);
    return new Promise((resolve, reject) => {
      chrome.downloads.download(
        { url, filename, saveAs: false, conflictAction: "uniquify" },
        (downloadId) => {
          const err = chrome.runtime.lastError;
          if (err || downloadId === undefined) {
            URL.revokeObjectURL(url);
            reject(new Error(err?.message ?? "Download failed"));
            return;
          }
          setTimeout(() => URL.revokeObjectURL(url), 60_000);
          resolve();
        },
      );
    });
  }
  anchorDownload(filename, blob);
  return Promise.resolve();
}
