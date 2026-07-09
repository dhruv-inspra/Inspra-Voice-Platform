import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPromptPackage,
  buildObsidianLearningNote,
  classifyWorkItem
} from "./promptPackage.js";

test("buildPromptPackage creates the required Voice Agent OS artifacts", () => {
  const result = buildPromptPackage(
    {
      client: "Acme Dental",
      agentType: "Inbound",
      platform: "Elk",
      sourceBrief: "Book hygiene visits and route emergency pain calls.",
      llmProvider: "OpenRouter",
      llmModel: "openai/gpt-4.1-mini"
    },
    "create"
  );

  assert.match(result.output, /## Role/);
  assert.match(result.blueprint, /Acme Dental/);
  assert.match(result.callScript, /Opening/);
  assert.match(result.salesScript, /Opening/);
  assert.match(result.callFlowChart, /Greeting -> Intent/);
  assert.match(result.integrationBlueprint, /Elk/);
  assert.match(result.integrationFlowchart, /Elk/);
  assert.match(result.elkExport.descriptionTxt, /Inbound/);
  assert.doesNotThrow(() => JSON.parse(result.elkExport.openaiSchemaJson));
  assert.doesNotThrow(() => JSON.parse(result.elkExport.postBodyJson));
  assert.match(result.elkExport.functionConfigMd, /success condition/i);
});

test("buildPromptPackage uses Elk prompt structure and variable names", () => {
  const result = buildPromptPackage(
    {
      client: "NextGen Innovations",
      agentType: "Outbound",
      platform: "Elk",
      sourceBrief: "Call equipment hire businesses and create interest in a demo.",
      voiceStyle: "Warm, confident, and natural"
    },
    "create"
  );

  const expectedSections = [
    "## Role",
    "## Tools",
    "## Speaking Style",
    "## Product Summary",
    "## Product Detail Answers",
    "## Opening",
    "## Main Pitch",
    "## Discovery",
    "## Short Response Rules",
    "## Call To Action",
    "## Demo Or Callback Capture",
    "## Phone Number",
    "## Objections",
    "## When Challenged",
    "## Gatekeeper",
    "## Unknown Questions",
    "## Silence Handling",
    "## Sample Dialogues",
    "## Hard Rules"
  ];

  for (const section of expectedSections) {
    assert.match(result.output, new RegExp(section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(result.output, /Current date and time: \{\{CURRENT_DATE_TIME\}\}/);
  assert.match(result.output, /Prospect Name: \{\{firstName\}\}/);
  assert.match(result.output, /Customer Phone: \{\{customer_phone\}\}/);
  assert.match(result.output, /Available tools: `demo_book`, `end_call`/);
  assert.match(result.output, /`caller_name`/);
  assert.match(result.output, /`phone_number`/);
  assert.match(result.output, /`preferred_callback_date`/);
  assert.match(result.output, /`preferred_callback_time`/);
  assert.match(result.output, /Do not collect email\./);
  assert.match(result.output, /"Perfect\. I'll pass that through to the NextGen Innovations team now\."/);
  assert.match(result.output, /Never mention Inspra or Elk\./);

  const schema = JSON.parse(result.elkExport.openaiSchemaJson);
  assert.deepEqual(schema.required, [
    "caller_name",
    "phone_number",
    "preferred_callback_date",
    "preferred_callback_time"
  ]);
});

test("buildPromptPackage aligns docs with Obsidian and Diagram Skill deliverables", () => {
  const result = buildPromptPackage(
    {
      client: "Acme Dental",
      platform: "Elk",
      sourceBrief: "Inbound calls need booking, triage, and follow-up learning."
    },
    "create"
  );

  assert.match(result.blueprint, /Diagram Skill Package/);
  assert.match(result.blueprint, /Title Page/);
  assert.match(result.blueprint, /Diagram Walkthrough/);
  assert.match(result.blueprint, /Next Steps/);
  assert.match(result.integrationBlueprint, /Obsidian Flow/);
  assert.match(result.integrationBlueprint, /YAML properties/);
  assert.match(result.obsidianLearning, /source_artifact: "prompt_package"/);
  assert.match(result.obsidianLearning, /diagram_skill_aligned: true/);
});

test("buildPromptPackage defaults to Elk and OpenRouter model routing", () => {
  const result = buildPromptPackage(
    {
      client: "Acme Dental",
      agentType: "Inbound",
      sourceBrief: "Handle calls and qualify lead intent."
    },
    "create"
  );

  assert.match(result.output, /Platform: Elk/);
  assert.match(result.output, /LLM provider: OpenRouter/);
  assert.match(result.output, /LLM model: OpenRouter auto model/);
  assert.match(result.deploymentPackage, /Production package ready for Elk/);
  assert.match(result.deploymentPackage, /OpenRouter \/ OpenRouter auto model/);
});

test("buildPromptPackage keeps Retell and Vapi as spare platform options", () => {
  const retellResult = buildPromptPackage(
    {
      client: "Acme Dental",
      platform: "Retell",
      agentType: "Outbound"
    },
    "create"
  );
  const vapiResult = buildPromptPackage(
    {
      client: "Acme Dental",
      platform: "Vapi",
      agentType: "Inbound"
    },
    "create"
  );

  assert.match(retellResult.output, /Platform: Retell/);
  assert.match(vapiResult.output, /Platform: Vapi/);
  assert.match(retellResult.output, /LLM provider: OpenRouter/);
  assert.match(vapiResult.output, /LLM provider: OpenRouter/);
});

test("buildPromptPackage normalizes unsupported platforms and agent types", () => {
  const result = buildPromptPackage(
    {
      client: "Acme Dental",
      platform: "LiveKit",
      agentType: "FAQ handler",
      llmProvider: "OpenAI",
      llmModel: "GPT-4.1"
    },
    "create"
  );

  assert.match(result.output, /You are an inbound AI voice assistant calling on behalf of Acme Dental\./);
  assert.match(result.output, /Platform: Elk/);
  assert.match(result.output, /LLM provider: OpenRouter/);
  assert.match(result.output, /LLM model: OpenRouter auto model/);
});

test("buildPromptPackage includes functional QA testing artifacts", () => {
  const result = buildPromptPackage(
    {
      client: "Acme Dental",
      agentType: "Outbound",
      sourceBrief: "Call warm leads and qualify sales interest."
    },
    "create"
  );

  assert.match(result.qaChecklist, /Functional QA testing/);
  assert.match(result.qaGates, /Inbound and outbound scenario tests/);
  assert.match(result.testReport, /functional QA testing/i);
});

test("classifyWorkItem separates approval changes from safe operational fixes", () => {
  assert.deepEqual(classifyWorkItem("Client wants a new greeting and tone"), {
    bucket: "Prompt or greeting",
    safeToFix: false,
    approvalRequired: true
  });

  assert.deepEqual(classifyWorkItem("Webhook route failed after HubSpot token refresh"), {
    bucket: "Workflow automation",
    safeToFix: true,
    approvalRequired: false
  });
});

test("buildObsidianLearningNote returns markdown with machine-readable properties", () => {
  const note = buildObsidianLearningNote({
    client: "Acme Dental",
    title: "Calendar booking required proof",
    bucket: "Calendar or booking",
    evidence: "The call said booked before the calendar event existed.",
    verificationResult: "Require event ID before confirmation."
  });

  assert.match(note, /^---\n/);
  assert.match(note, /tags:\n  - inspra/);
  assert.match(note, /client: "Acme Dental"/);
  assert.match(note, /## Learning/);
  assert.match(note, /Require event ID/);
});
