#!/usr/bin/env node
/**
 * FlareMo SessionStart hook (§IV of the harness adapter spec).
 *
 * Fetches the compiled memory lens for the current working directory and
 * prints it to stdout so the host injects it into the session context.
 * Contract (§VII.3): on failure this must degrade honestly and silently —
 * exit 0 with no output when the service is unreachable (never block the
 * session, never claim the ledger was consulted when it was not).
 *
 * Configuration comes from the environment (FLAREMO_URL / FLAREMO_PAT), which
 * the plugin user_config maps into; a missing PAT means memory is not set up
 * and the hook stays completely silent.
 */
const FLAREMO_URL = (process.env.FLAREMO_URL || process.env.FLAREMO_DEV_URL || "").replace(/\/+$/, "");
const FLAREMO_PAT = process.env.FLAREMO_PAT || "";
const projectKey = process.env.FLAREMO_PROJECT || process.cwd();
const agent = process.env.FLAREMO_AGENT || "zcode";

if (!FLAREMO_URL || !FLAREMO_PAT) process.exit(0);

main().catch(() => process.exit(0));

async function main() {
  const http = FLAREMO_URL.startsWith("http:")
    ? await import("node:http")
    : await import("node:https");
  const { URL } = await import("node:url");
  const target = new URL(`${FLAREMO_URL}/memory/mcp`);
  const payload = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "memory_compile",
      arguments: { agent, project_key: projectKey, max_chars: 6000 },
    },
  });
  const result = await new Promise((resolve, reject) => {
    const req = http.request(
      target,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          Authorization: `Bearer ${FLAREMO_PAT}`,
        },
        timeout: 5000,
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode, body }));
      },
    );
    req.setTimeout(5000, () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.write(payload);
    req.end();
  });

  if (result.status !== 200) process.exit(0);
  let data;
  try {
    data = JSON.parse(result.body);
  } catch {
    process.exit(0);
  }
  if (data?.error || data?.result?.isError) process.exit(0);
  const compiled = data?.result?.structuredContent ?? data?.result;
  const projection = compiled?.system_prompt_payload;
  if (typeof projection !== "string" || !projection.trim()) process.exit(0);
  console.log(projection);
  process.exit(0);
}