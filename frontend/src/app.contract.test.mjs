import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const appSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "App.jsx"),
  "utf8"
);
const indexSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../index.html"),
  "utf8"
);
const styleSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "styles.css"),
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
  assert.match(appSource, /id: "overview", label: "Overview"/);
  assert.doesNotMatch(appSource, /id: "workspace", label: "Workspaces"/);
  assert.doesNotMatch(appSource, /id: "command", label: "Dashboard"/);
  assert.match(appSource, /id: "buildStudio", label: "Build Studio"/);
  assert.match(appSource, /id: "docs", label: "Docs Studio"/);
  assert.match(appSource, /Manage your organization's workspaces and delivery status/);
});

test("real workspaces do not expose overview navigation", () => {
  const baseTabsBlock = appSource.match(/const baseTabs = \[[\s\S]*?\];/)?.[0] || "";

  assert.doesNotMatch(baseTabsBlock, /Dashboard/);
  assert.doesNotMatch(baseTabsBlock, /Overview/);
  assert.doesNotMatch(appSource, /workspace-switcher/);
  assert.match(appSource, /setActiveTab\("overview"\)/);
  assert.match(appSource, /isDefaultWorkspace && activeTab === "overview"/);
  assert.match(appSource, /!isDefaultWorkspace && activeTab === "agents"/);
  assert.match(appSource, /className="sidebar-organization"/);
  assert.match(appSource, /Back to workspace/);
  assert.match(appSource, /setActiveTab\(isDefaultWorkspace \? "organizations" : "overview"\)/);
  assert.match(appSource, /organization-picker-screen/);
  assert.match(appSource, /organization-mode/);
  assert.match(styleSource, /\.app-shell\.organization-mode[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(styleSource, /\.app-shell\.organization-mode \.sidebar[\s\S]*display: none/);
  assert.doesNotMatch(appSource, /lastWorkspaceId/);
  assert.match(appSource, /Default workspace/);
});

test("workspace directory creates separate workspace entities", () => {
  assert.match(appSource, /apiRequest\("\/api\/prompt-jobs"/);
  assert.match(appSource, /function ClientWorkspacePage/);
  assert.match(appSource, /Organization directory/);
  assert.match(appSource, /const \[overviewTab, setOverviewTab\] = useState\("workspaces"\)/);
  assert.match(appSource, /Workspaces \(\{clients\.length\}\)[\s\S]*Members \(\{members\.length\}\)/);
  assert.match(appSource, /Members \(\{members\.length\}\)/);
  assert.match(appSource, /Workspaces \(\{clients\.length\}\)/);
  assert.match(appSource, /Invite Member/);
  assert.match(appSource, /function changeOverviewRole/);
  assert.match(appSource, /Create workspace/);
  assert.match(appSource, /const \[showCreateWorkspace, setShowCreateWorkspace\] = useState\(false\)/);
  assert.match(appSource, /showCreateWorkspace &&/);
  assert.match(appSource, /function copyInviteTemplate/);
  assert.match(appSource, /Subject: Invitation to join Inspra/);
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
  assert.match(appSource, /<PromptBox/);
  assert.match(appSource, /className="version-select"/);
});

test("sidebar tabs do not show numeric prefixes", () => {
  const sideNavBlock = appSource.match(/<nav className="side-nav">[\s\S]*?<\/nav>/)?.[0] || "";

  assert.doesNotMatch(sideNavBlock, /padStart\(2, "0"\)/);
  assert.doesNotMatch(sideNavBlock, /<span>/);
});

test("sidebar account details are placed near logout", () => {
  const brandBlock = appSource.match(/<div className="brand-row">[\s\S]*?<\/div>\s*<\/div>/)?.[0] || "";
  const sidebarBottomBlock = appSource.match(/<div className="sidebar-bottom">[\s\S]*?<\/div>\s*<\/aside>/)?.[0] || "";

  assert.doesNotMatch(brandBlock, /user\.email/);
  assert.match(sidebarBottomBlock, /className="sidebar-user"/);
  assert.match(sidebarBottomBlock, /Log out/);
});

test("topbar exposes theme and layout controls", () => {
  const topbarBlock = appSource.match(/<header className="topbar">[\s\S]*?<\/header>/)?.[0] || "";

  assert.match(appSource, /getInitialLayout/);
  assert.match(appSource, /inspra-layout/);
  assert.match(appSource, /className="icon-button"/);
  assert.match(appSource, /Switch to \$\{theme === "dark" \? "light" : "dark"\} mode/);
  assert.doesNotMatch(topbarBlock, /Create workspace/);
});

test("settings separates general and user credential sections", () => {
  assert.match(appSource, /const \[settingsTab, setSettingsTab\] = useState\("general"\)/);
  assert.match(appSource, /settingsTab === "general"/);
  assert.match(appSource, /settingsTab === "creds"/);
  assert.match(appSource, /Panel title="General Settings"/);
  assert.match(appSource, /Panel title="User Credentials"/);
});

test("model controls only expose OpenRouter provider and OpenRouter models", () => {
  const providerBlock = appSource.match(/const llmProviders = \[[\s\S]*?\];/)?.[0] || "";
  const modelBlock = appSource.match(/const llmModels = \[[\s\S]*?\];/)?.[0] || "";

  assert.match(providerBlock, /"OpenRouter"/);
  assert.doesNotMatch(providerBlock, /OpenAI|Anthropic|Google|Groq|AI selects provider/);
  assert.match(modelBlock, /openrouter/i);
  assert.doesNotMatch(modelBlock, /GPT-4\.1|Claude|Gemini|Groq|AI selects best model/);
  assert.match(appSource, /function HelpLabel/);
  assert.match(appSource, /className="help-dot"[\s\S]*>\s*i\s*<\/span>/);
  assert.match(styleSource, /\.help-dot[\s\S]*font-style: italic/);
  assert.match(appSource, /Controls variation\. Lower is more consistent; higher is more creative\./);
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
  assert.match(appSource, /Integration blueprint/);
  assert.match(appSource, /Call script/);
  assert.match(appSource, /Call flow/);
  assert.match(appSource, /Blueprint/);
  assert.match(appSource, /requestedDocs: selectedDocs/);
  assert.match(appSource, /<PromptOutput job=\{promptOutput\} mode="docs" title="Docs output" showPrompt=\{false\}/);
  const docsBlock = appSource.match(/function DocsPage[\s\S]*?function DiagramSkillPanel/)?.[0] || "";
  assert.match(docsBlock, /Information/);
  assert.doesNotMatch(docsBlock, /Source notes/);
  assert.doesNotMatch(docsBlock, /SelectInput label="Platform"/);
  assert.doesNotMatch(docsBlock, /SelectInput label="Agent type"/);
  assert.doesNotMatch(docsBlock, /TextInput label="Industry"/);
});

test("generated prompt can be copied and docs download as one PDF", () => {
  assert.match(appSource, /className="prompt-icon-button"/);
  assert.match(appSource, /aria-label="Copy"/);
  assert.match(appSource, /aria-label="View"/);
  assert.match(appSource, /function IconGlyph/);
  assert.match(appSource, /setCopyState\("✓"\)/);
  assert.match(appSource, /className="prompt-line-numbers"/);
  assert.match(appSource, /setExpanded\(true\)/);
  assert.match(appSource, />\s*Download\s*<\/button>/);
  assert.doesNotMatch(appSource, /Download docs PDF/);
  assert.doesNotMatch(appSource, /Copy prompt/);
  assert.match(appSource, /function downloadDocsPdf/);
  assert.match(appSource, /function createDiagramPdf/);
  assert.match(appSource, /function drawSwimlaneDiagram/);
  assert.match(appSource, /INSPRA AI/);
  assert.match(appSource, /#39E100/);
  assert.match(appSource, /application\/pdf/);
  assert.match(appSource, /URL\.createObjectURL/);
  assert.match(appSource, /download = buildDownloadFilename\(job, "pdf"\)/);
  assert.doesNotMatch(appSource, /Diagram-Skill-v2 aligned|source code|Client-facing documentation package|Companion Write-up/);
  assert.doesNotMatch(appSource, /text\/markdown/);
  assert.doesNotMatch(appSource, /const labels = \["Input", "Agent", "Decision", "Handoff"\]/);
});

test("docs output gives each generated document its own download button", () => {
  assert.match(appSource, /function downloadDocPdf/);
  assert.match(appSource, /onDownload=/);
  assert.match(appSource, /downloadDocPdf\(job, item\)/);
  assert.doesNotMatch(appSource, /Download \{title\} PDF/);
  assert.match(appSource, /item\.type === "writeup" \? createClientWriteupPdf\(job, item\) : createDiagramPdf/);
});

test("document PDFs use different renderers for script, flow, and integration", () => {
  assert.match(appSource, /function drawSwimlaneDiagram/);
  assert.match(appSource, /function drawCallFlowDiagram/);
  assert.match(appSource, /function drawIntegrationDiagram/);
  assert.match(appSource, /function drawScriptDocument/);
  assert.match(appSource, /type: "script"/);
  assert.match(appSource, /type: "call-flow"/);
  assert.match(appSource, /type: "integration"/);
  assert.match(appSource, /page\.visual === "call-flow"/);
  assert.match(appSource, /page\.visual === "integration"/);
  assert.match(appSource, /page\.visual === "script"/);
});

test("blueprint PDF follows Diagram v2 wide swimlane visual system", () => {
  assert.match(appSource, /function addPdfRoundRect/);
  assert.match(appSource, /pageWidth = 1238/);
  assert.match(appSource, /pageHeight = 807/);
  assert.match(appSource, /Qualified Outcome/);
  assert.match(appSource, /PHASE 1\\nLOCAL/);
  assert.match(appSource, /PHASE 2\\nEVENTS/);
  assert.match(appSource, /FUTURE\\nTBC/);
  assert.match(appSource, /Open Questions/);
  assert.match(appSource, /wideDiagram \? 1238 : 842/);
});

test("build studio output shows docs download buttons when docs artifacts exist", () => {
  assert.match(appSource, /const hasDocArtifacts = mode !== "elk" && artifactItems\.some\(\(item\) => item\.value\)/);
  assert.match(appSource, /const showDownload = mode === "docs" \|\| hasDocArtifacts/);
  assert.match(appSource, /promptOutput && <PromptOutput job=\{promptOutput\} mode="prompt" title="Prompt output" \/>/);
});

test("diagram docs include separate client write-up artifacts", () => {
  assert.match(appSource, /function buildArtifactWriteup/);
  assert.match(appSource, /function createClientWriteupPdf/);
  assert.match(appSource, /title: `\$\{item\.title\} write-up`/);
  assert.match(appSource, /Executive Summary/);
  assert.match(appSource, /Current Situation/);
  assert.match(appSource, /Diagram Walkthrough/);
  assert.match(appSource, /Investment & Returns/);
  assert.match(appSource, /Review the diagram and this write-up together/);
  assert.match(appSource, /type: "writeup"/);
});

test("generation surfaces keep separate output state and accept attachments", () => {
  assert.match(appSource, /const \[buildOutput, setBuildOutput\] = useState\(""\)/);
  assert.match(appSource, /const \[docsOutput, setDocsOutput\] = useState\(""\)/);
  assert.match(appSource, /const \[elkOutput, setElkOutput\] = useState\(""\)/);
  assert.doesNotMatch(appSource, /const \[promptOutput, setPromptOutput\] = useState\(""\)/);
  assert.match(appSource, /function SourceFilesInput/);
  assert.match(appSource, /MAX_ATTACHMENT_MB = 10/);
  assert.match(appSource, /Max \$\{MAX_ATTACHMENT_MB\} MB per file/);
  assert.match(appSource, /type="file" multiple/);
  assert.match(appSource, /readFilesAsAttachments/);
  assert.match(appSource, /function extractPdfText/);
});

test("branding keeps wordmark favicon and removes icon mark from sidebar", () => {
  const brandBlock = appSource.match(/<div className="brand-row">[\s\S]*?<\/div>\s*<\/div>/)?.[0] || "";

  assert.match(indexSource, /href="\/brand\/inspra-wordmark\.png"/);
  assert.doesNotMatch(indexSource, /href="\/brand\/inspra-logo\.png"/);
  assert.match(brandBlock, /brand-wordmark/);
  assert.doesNotMatch(brandBlock, /brand-logo/);
});

test("build tools use the selected workspace without asking for a workspace name", () => {
  assert.match(appSource, /<NewPromptPage selectedClient=\{selectedClient\}/);
  assert.match(appSource, /<DocsPage selectedClient=\{selectedClient\}/);
  assert.match(appSource, /<OptimizePage selectedClient=\{selectedClient\}/);

  const buildStudioBlock = appSource.match(/function NewPromptPage[\s\S]*?function DocsPage/)?.[0] || "";
  const docsBlock = appSource.match(/function DocsPage[\s\S]*?function DiagramSkillPanel/)?.[0] || "";
  const elkBuilderBlock = appSource.match(/function OptimizePage[\s\S]*?function NewPromptPage/)?.[0] || "";

  assert.doesNotMatch(buildStudioBlock, /TextInput label="Workspace"/);
  assert.doesNotMatch(docsBlock, /TextInput label="Workspace"/);
  assert.doesNotMatch(elkBuilderBlock, /TextInput label="Workspace"/);
});

test("production validation exposes QA testing action", () => {
  assert.match(appSource, /QA testing/);
  assert.match(appSource, /Run QA testing/);
});
