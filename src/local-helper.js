// Fixed loopback endpoint for the unpacked extension. Never send the ASU token
// to the extension; its ID must be authorized in the helper's private config.
export const LOCAL_HELPER_ORIGIN = "http://127.0.0.1:8123";
export function helperUrl(path, extension = false) {
  return extension ? `${LOCAL_HELPER_ORIGIN}${path}` : path;
}
