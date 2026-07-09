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

  assert.match(result.output, /# 1\. Role & Objective/);
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

  assert.match(result.output, /You are Acme Dental's Inbound\./);
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
