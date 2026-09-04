import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPromptPackage,
  buildPromptPackageWithOpenRouter,
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
  assert.match(result.callFlowChart, /Routing Branches/);
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
  assert.match(result.output, /Never mention internal tools, platform names, model names, meeting recordings, transcripts, or source notes\./);

  const schema = JSON.parse(result.elkExport.openaiSchemaJson);
  assert.deepEqual(schema.required, [
    "caller_name",
    "phone_number",
    "preferred_callback_date",
    "preferred_callback_time"
  ]);
});

test("buildPromptPackage creates client-facing docs without internal generation notes", () => {
  const result = buildPromptPackage(
    {
      client: "Acme Dental",
      platform: "Elk",
      sourceBrief: "Inbound calls need booking, triage, and follow-up learning."
    },
    "create"
  );

  assert.match(result.blueprint, /Title Page/);
  assert.match(result.blueprint, /Diagram Walkthrough/);
  assert.match(result.blueprint, /Next Steps/);
  assert.match(result.callScript, /Production Call Script/);
  assert.match(result.callScript, /Opening Script/);
  assert.match(result.callScript, /Script Guardrails/);
  assert.doesNotMatch(result.callScript, /Production Flow|Data Movement/);
  assert.match(result.callFlowChart, /Call Flow and Routing Logic/);
  assert.match(result.callFlowChart, /Routing Branches/);
  assert.match(result.callFlowChart, /QA Scenarios/);
  assert.doesNotMatch(result.callFlowChart, /Opening Script|Data Movement/);
  assert.match(result.integrationBlueprint, /Production Flow/);
  assert.match(result.integrationBlueprint, /Data Movement/);
  assert.match(result.integrationBlueprint, /Failure Handling/);
  assert.doesNotMatch(result.integrationBlueprint, /Opening Script|Production Call Script/);
  assert.doesNotMatch(result.blueprint, /Diagram Skill|Diagram-Skill|Obsidian|YAML|LLM|model|source code/i);
  assert.doesNotMatch(result.integrationBlueprint, /Diagram Skill|Diagram-Skill|Obsidian|YAML|LLM|model|source code/i);
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

  assert.doesNotMatch(retellResult.output, /Platform: Retell/);
  assert.doesNotMatch(vapiResult.output, /Platform: Vapi/);
  assert.doesNotMatch(retellResult.output, /LLM provider: OpenRouter/);
  assert.doesNotMatch(vapiResult.output, /LLM provider: OpenRouter/);
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

  assert.match(result.output, /You are an inbound AI voice assistant for Acme Dental\./);
  assert.doesNotMatch(result.output, /Platform: Elk/);
  assert.doesNotMatch(result.output, /LLM provider: OpenRouter/);
  assert.doesNotMatch(result.output, /LLM model: OpenRouter auto model/);
});

test("buildPromptPackage distills mortgage discovery into a production-ready prompt", () => {
  const result = buildPromptPackage(
    {
      client: "Test",
      agentType: "Inbound",
      sourceBrief: `Impromptu Zoom Meeting - June 30
VIEW RECORDING - 32 mins (No highlights):
0:00 - Amanda
  We provide loans that are secured by either a first or a second mortgage. Most of our loans are second mortgages.
  If a customer cannot meet serviceability hurdles of the major banks, they can convert equity into cash.
  The interest is added to the loan, so the customer is not required to use salary or business income for monthly repayments.
  We get a share of the capital growth when they repay us.
  The objective is to get them to book a call with Amanda. We don't want the agent to replace Amanda.
  Calls are done via Calendly and usually allow 20 minutes.`
    },
    "create"
  );

  assert.match(result.output, /Approved product knowledge/);
  assert.match(result.output, /secured by a first or second mortgage/i);
  assert.match(result.output, /no monthly repayments|monthly repayment/i);
  assert.match(result.output, /Amanda/);
  assert.doesNotMatch(result.output, /VIEW RECORDING|Impromptu Zoom|0:00 - Amanda|Source material/);
  assert.doesNotMatch(result.output, /Platform:|LLM provider|Temperature|Max tokens|Reasoning mode/);
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

test("buildPromptPackage returns only requested docs when selected", () => {
  const result = buildPromptPackage(
    {
      client: "Midkey",
      sourceBrief: "Equity lending product for homeowners.",
      requestedDocs: ["Script", "Call flow"]
    },
    "create"
  );

  assert.equal(result.blueprint, "");
  assert.match(result.callScript, /Midkey Production Call Script/);
  assert.match(result.callFlowChart, /Routing Branches/);
  assert.equal(result.integrationBlueprint, "");
  assert.equal(result.elkSchema, "");
});

test("buildPromptPackageWithOpenRouter uses OpenRouter when configured", async () => {
  const calls = [];
  const result = await buildPromptPackageWithOpenRouter(
    {
      client: "Midkey",
      llmModel: "openai/gpt-4.1-mini",
      sourceBrief: "Loans secured by property equity."
    },
    "create",
    {
      apiKey: "test-key",
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return {
          ok: true,
          async json() {
            return {
              choices: [{ message: { content: "## Role\n\nOpenRouter production prompt." } }]
            };
          }
        };
      }
    }
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://openrouter.ai/api/v1/chat/completions");
  assert.match(calls[0].options.headers.Authorization, /Bearer test-key/);
  assert.equal(JSON.parse(calls[0].options.body).model, "openai/gpt-4.1-mini");
  assert.equal(result.output, "## Role\n\nOpenRouter production prompt.");
  assert.equal(result.generationProvider, "openrouter");
});

test("buildPromptPackageWithOpenRouter generates requested docs through OpenRouter", async () => {
  const calls = [];
  const result = await buildPromptPackageWithOpenRouter(
    {
      client: "Midkey",
      llmModel: "openai/gpt-4.1-mini",
      sourceBrief: "Loans secured by property equity.",
      requestedDocs: ["Blueprint", "Call flow"],
      attachments: [
        {
          name: "brief.md",
          type: "text/markdown",
          size: 44,
          text: "Amanda handles human calls after eligibility."
        }
      ]
    },
    "create",
    {
      apiKey: "test-key",
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        if (calls.length === 1) {
          return {
            ok: true,
            async json() {
              return {
                choices: [{ message: { content: "## Role\n\nOpenRouter production prompt." } }]
              };
            }
          };
        }

        return {
          ok: true,
          async json() {
            return {
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      blueprint: "# Client Blueprint\n\nLLM generated blueprint.",
                      callScript: "",
                      callFlowChart: "Input -> Agent -> Handoff",
                      integrationBlueprint: ""
                    })
                  }
                }
              ]
            };
          }
        };
      }
    }
  );

  assert.equal(calls.length, 2);
  const firstPayload = JSON.parse(calls[0].options.body);
  const secondPayload = JSON.parse(calls[1].options.body);
  assert.match(JSON.stringify(firstPayload.messages), /brief\.md/);
  assert.match(JSON.stringify(secondPayload.messages), /Requested documents: Blueprint, Call flow/);
  assert.match(JSON.stringify(secondPayload.messages), /Client-facing documentation rules/);
  assert.match(JSON.stringify(secondPayload.messages), /Brand is Inspra AI/);
  assert.match(JSON.stringify(secondPayload.messages), /separate write-up document/);
  assert.doesNotMatch(JSON.stringify(secondPayload.messages), /Diagram-Skill-v2 aligned|internal model settings/);
  assert.match(result.blueprint, /LLM generated blueprint/);
  assert.match(result.callFlowChart, /Input -> Agent -> Handoff/);
  assert.equal(result.callScript, "");
  assert.equal(result.integrationBlueprint, "");
  assert.equal(result.generationProvider, "openrouter");
});

test("buildPromptPackageWithOpenRouter requires an API key before generation", async () => {
  await assert.rejects(
    () =>
      buildPromptPackageWithOpenRouter(
        {
          client: "Midkey",
          sourceBrief: "Loans secured by property equity."
        },
        "create",
        { apiKey: "" }
      ),
    /OPENROUTER_API_KEY is required/
  );
});

test("buildPromptPackageWithOpenRouter falls back only after an OpenRouter API error", async () => {
  let attempted = false;
  const result = await buildPromptPackageWithOpenRouter(
    {
      client: "Midkey",
      sourceBrief: "Loans secured by property equity."
    },
    "create",
    {
      apiKey: "test-key",
      fetchImpl: async () => {
        attempted = true;
        return {
          ok: false,
          status: 503,
          async text() {
            return "provider unavailable";
          }
        };
      }
    }
  );

  assert.equal(attempted, true);
  assert.equal(result.generationProvider, "local-template");
  assert.match(result.generationNote, /OpenRouter generation failed/);
  assert.match(result.output, /Approved product knowledge/);
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
