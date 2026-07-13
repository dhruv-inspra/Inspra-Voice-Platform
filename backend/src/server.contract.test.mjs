import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const serverSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "server.js"),
  "utf8"
);
const supabaseDataSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "supabaseData.js"),
  "utf8"
);

test("server exposes prompt job history for client workspaces", () => {
  assert.match(serverSource, /app\.get\("\/api\/prompt-jobs"/);
  assert.match(serverSource, /listUserCollection\(req\.supabase, "promptJobs"\)/);
});

test("server stores manual agent prompt versions", () => {
  assert.match(serverSource, /app\.post\("\/api\/agent-prompts"/);
  assert.match(serverSource, /type: "manual-agent-prompt"/);
  assert.match(serverSource, /output: prompt/);
  assert.doesNotMatch(serverSource, /agentPrompt: prompt/);
  assert.match(serverSource, /Prompt is required/);
});

test("prompt job persistence uses only base schema columns", () => {
  const promptJobsBlock = supabaseDataSource.match(/promptJobs: \{[\s\S]*?\n    \}/)?.[0] || "";

  assert.match(promptJobsBlock, /output: "output"/);
  assert.doesNotMatch(promptJobsBlock, /blueprint|sales_script|call_flow_chart|agent_prompt/);
  assert.doesNotMatch(promptJobsBlock, /integration_flowchart|elk_description|qa_checklist|deployment_package/);
});

test("generated package artifacts are returned without requiring artifact columns", () => {
  assert.equal(
    [...serverSource.matchAll(/promptJob: \{ \.\.\.promptJob, \.\.\.packageOutput \}/g)].length,
    2
  );
});
