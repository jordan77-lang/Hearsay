// Local connection check only; never imported by the website or extension.
import { readFile } from "node:fs/promises";

const configPath = new URL("../createai/config.local.json", import.meta.url);
const allowedHosts = new Set([
  "api-main.aiml.asu.edu",
  "api-main-beta.aiml.asu.edu",
  "api-main-poc.aiml.asu.edu",
]);

async function main() {
  let config;
  try {
    config = JSON.parse(await readFile(configPath, "utf8"));
  } catch (error) {
    console.error(error.code === "ENOENT"
      ? "Copy createai/config.example.json to createai/config.local.json, then enter your service token in the local file."
      : "Could not read createai/config.local.json. Check that it contains valid JSON.");
    process.exitCode = 1;
    return;
  }

  const token = String(config.serviceToken ?? "").trim();
  if (!token) throw new Error("Enter your service token in createai/config.local.json. Do not paste it into chat.");
  const base = new URL(config.baseUrl);
  if (base.protocol !== "https:" || !allowedHosts.has(base.hostname) || base.port ||
      base.username || base.password || base.search || base.hash || !/^\/v1\/?$/.test(base.pathname)) {
    throw new Error("baseUrl must be an ASU Production, Beta, or POC HTTPS API address ending in /v1.");
  }

  console.log(`Testing ASU connection: ${base.hostname} (project model setting: ${config.model || "defaults"})`);
  let response;
  try {
    response = await fetch(`${base.origin}/v1/chat/completions`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(60000),
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model || "defaults",
        stream: false,
        messages: [{ role: "user", content: "Connection test for HearSay. Reply with exactly: HEARSAY_CONNECTED" }],
      }),
    });
  } catch {
    throw new Error("ASU request failed or timed out. Check your network and the configured API address.");
  }

  // Do not log response bodies, request headers, or credentials.
  if (!response.ok) {
    const hint = response.status === 401 || response.status === 403
      ? " Check the token, its environment, and project access; this status alone does not identify the cause."
      : response.status === 429 ? " Check the project's rate limit and budget." : " Check ASU API settings and service status.";
    throw new Error(`ASU returned HTTP ${response.status}.${hint}`);
  }
  let data;
  try { data = await response.json(); } catch {
    throw new Error("ASU returned HTTP success but the response was not valid JSON.");
  }
  const reply = data.choices?.[0]?.message?.content;
  if (typeof reply !== "string" || !reply.includes("HEARSAY_CONNECTED")) {
    throw new Error("ASU returned HTTP success, but not the expected test reply. Check the project's default model and behavior.");
  }
  console.log("Connection succeeded. The service token and selected ASU environment work together.");
  console.log("This checks connectivity only; dictionary analysis is the next step.");
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
