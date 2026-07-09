import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const serverSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "server.js"),
  "utf8"
);

test("server exposes prompt job history for client workspaces", () => {
  assert.match(serverSource, /app\.get\("\/api\/prompt-jobs"/);
  assert.match(serverSource, /listUserCollection\(req\.supabase, "promptJobs"\)/);
});

test("server stores manual agent prompt versions", () => {
  assert.match(serverSource, /app\.post\("\/api\/agent-prompts"/);
  assert.match(serverSource, /type: "manual-agent-prompt"/);
  assert.match(serverSource, /agentPrompt: prompt/);
  assert.match(serverSource, /Prompt is required/);
});
