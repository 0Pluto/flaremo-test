#!/usr/bin/env node
/**
 * FlareMo Stop hook (§IV of the harness adapter spec).
 *
 * Reads the transcript summary handed over by the host (stdin JSON, Claude
 * Code-style hook payload), extracts a lightweight digest, and drops a
 * checkpoint into the ledger — strictly fire-and-forget (§IV iron rule): the
 * request is sent from a detached process so the session never waits on the
 * ledger.
 *
 * Failure posture: any error is silent; memory being down must never make a
 * session end noisy.
 */
import { spawn } from "node:child_process";
import { join } from "node:path";
import { homedir } from "node:os";

const CLI = process.env.FLAREMO_CLI || join(homedir(), ".local", "bin", "flaremo");
const summaryLimit = 2_000;

readStdin().then((stdinText) => {
  const digest = buildDigest(stdinText);
  if (!digest) process.exit(0);
  const projectKey = process.env.FLAREMO_PROJECT || process.cwd();
  // Fire-and-forget: detach the checkpoint so the hook returns immediately.
  const child = spawn(
    CLI,
    ["checkpoint", digest.slice(0, summaryLimit), "--project", projectKey, "--agent", process.env.FLAREMO_AGENT || "zcode"],
    { stdio: "ignore", detached: true },
  );
  child.on("error", () => process.exit(0));
  child.unref();
  process.exit(0);
});

function readStdin() {
  return new Promise((resolve) => {
    let text = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (text += chunk));
    process.stdin.on("end", () => resolve(text));
    // A hook that is never fed stdin must not hang the session end.
    setTimeout(() => resolve(text), 2_000).unref();
  });
}

/** The host payload shape varies; extract the most session-end-useful text. */
function buildDigest(stdinText) {
  if (!stdinText.trim()) return process.env.FLAREMO_SESSION_NOTE || "";
  try {
    const parsed = JSON.parse(stdinText);
    for (const key of ["last_message", "transcript", "summary", "message"]) {
      const value = parsed?.[key];
      if (typeof value === "string" && value.trim()) {
        return `会话收工：${value.trim().slice(0, 1_800)}`;
      }
    }
  } catch {
    // Not JSON: treat the raw stdin as the digest itself.
    return `会话收工：${stdinText.trim().slice(0, 1_800)}`;
  }
  return process.env.FLAREMO_SESSION_NOTE || "";
}