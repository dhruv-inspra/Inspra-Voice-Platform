import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const appSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "App.jsx"),
  "utf8"
);

test("navigation removes the Work Items tab", () => {
  const baseTabsBlock = appSource.match(/const baseTabs = \[[\s\S]*?\];/)?.[0] || "";

  assert.doesNotMatch(baseTabsBlock, /workItems/);
  assert.doesNotMatch(baseTabsBlock, /Work Items/);
});

test("default workspace owns workspace creation", () => {
  const baseTabsBlock = appSource.match(/const baseTabs = \[[\s\S]*?\];/)?.[0] || "";

  assert.doesNotMatch(baseTabsBlock, /label: "Clients"/);
  assert.doesNotMatch(baseTabsBlock, /Client Workspace/);
  assert.match(appSource, /id: "workspace", label: "Workspaces"/);
  assert.match(appSource, /id: "command", label: "Dashboard"/);
  assert.match(appSource, /id: "buildStudio", label: "Build Studio"/);
  assert.match(appSource, /Create, edit, delete, and open workspaces/);
});

test("real workspaces do not expose dashboard navigation", () => {
  const baseTabsBlock = appSource.match(/const baseTabs = \[[\s\S]*?\];/)?.[0] || "";

  assert.doesNotMatch(baseTabsBlock, /Dashboard/);
  assert.match(appSource, /setActiveTab\(event\.target\.value === "default" \? "command" : "agents"\)/);
  assert.match(appSource, /isDefaultWorkspace && activeTab === "command"/);
});

test("workspace directory creates separate workspace entities", () => {
  assert.match(appSource, /apiRequest\("\/api\/prompt-jobs"/);
  assert.match(appSource, /function ClientWorkspacePage/);
  assert.match(appSource, /Workspace directory/);
  assert.match(appSource, /Create workspace/);
  assert.doesNotMatch(appSource, /Panel title="Prompt history"/);
});

test("workspace directory can edit and delete workspaces", () => {
  assert.match(appSource, /method: "PATCH"/);
  assert.match(appSource, /method: "DELETE"/);
  assert.match(appSource, /Save workspace/);
  assert.match(appSource, /Delete/);
});

test("navigation exposes agent prompt version control", () => {
  const baseTabsBlock = appSource.match(/const baseTabs = \[[\s\S]*?\];/)?.[0] || "";

  assert.match(baseTabsBlock, /id: "agents", label: "Agent"/);
  assert.match(appSource, /function AgentPromptPage/);
  assert.match(appSource, /Prompt editor/);
  assert.match(appSource, /!isDefaultWorkspace && activeTab === "agents"/);
});

test("agent tab saves manual prompt versions", () => {
  assert.match(appSource, /\/api\/agent-prompts/);
  assert.match(appSource, /manual-agent-prompt/);
  assert.match(appSource, /Save prompt/);
  assert.match(appSource, /Update prompt/);
  assert.match(appSource, /Copy prompt/);
  assert.match(appSource, /className="version-select"/);
});

test("sidebar tabs do not show numeric prefixes", () => {
  const sideNavBlock = appSource.match(/<nav className="side-nav">[\s\S]*?<\/nav>/)?.[0] || "";

  assert.doesNotMatch(sideNavBlock, /padStart\(2, "0"\)/);
  assert.doesNotMatch(sideNavBlock, /<span>/);
});

test("topbar exposes theme and layout controls", () => {
  assert.match(appSource, /getInitialLayout/);
  assert.match(appSource, /inspra-layout/);
  assert.match(appSource, /className="icon-button"/);
  assert.match(appSource, /Switch to \$\{theme === "dark" \? "light" : "dark"\} mode/);
});

test("model controls only expose OpenRouter provider and OpenRouter models", () => {
  const providerBlock = appSource.match(/const llmProviders = \[[\s\S]*?\];/)?.[0] || "";
  const modelBlock = appSource.match(/const llmModels = \[[\s\S]*?\];/)?.[0] || "";

  assert.match(providerBlock, /"OpenRouter"/);
  assert.doesNotMatch(providerBlock, /OpenAI|Anthropic|Google|Groq|AI selects provider/);
  assert.match(modelBlock, /openrouter/i);
  assert.doesNotMatch(modelBlock, /GPT-4\.1|Claude|Gemini|Groq|AI selects best model/);
});

test("platform controls default to Elk and keep Retell/Vapi as spare options", () => {
  const platformBlock = appSource.match(/const platforms = \[[\s\S]*?\];/)?.[0] || "";

  assert.equal(platformBlock, 'const platforms = ["Elk", "Retell", "Vapi"];');
});

test("agent type controls are constrained to Inbound and Outbound", () => {
  const agentTypeBlock = appSource.match(/const agentTypes = \[[\s\S]*?\];/)?.[0] || "";

  assert.equal(agentTypeBlock, 'const agentTypes = ["Inbound", "Outbound"];');
  assert.doesNotMatch(appSource, /Appointment booking|FAQ handler/);
});

test("Docs page asks which document type to generate", () => {
  assert.match(appSource, /Documents/);
  assert.match(appSource, /Integration guide/);
  assert.match(appSource, /Call guide/);
  assert.match(appSource, /Call flow/);
  assert.match(appSource, /Script/);
});

test("production validation exposes QA testing action", () => {
  assert.match(appSource, /QA testing/);
  assert.match(appSource, /Run QA testing/);
});
