const qaGateList = [
  "Prompt uses the standard nine-section structure.",
  "Function names are exact and consistent across prompt, schema and config.",
  "Required fields are collected before function calls.",
  "The agent confirms success only after the function succeeds.",
  "Function names are never spoken to callers.",
  "Schemas and post bodies are valid JSON.",
  "Inbound and outbound scenario tests are executed before production.",
  "Calendar functions are sequenced correctly.",
  "Warm transfer, cold transfer and notification-only flows are separated.",
  "Prompt or greeting changes are separated from safe operational config fixes.",
  "Production scenario validation covers happy path, missing information, objections, transfer, off-topic, function failure and booking confirmation."
];

const triageRules = [
  {
    bucket: "Prompt or greeting",
    safeToFix: false,
    approvalRequired: true,
    keywords: ["prompt", "greeting", "tone", "wording", "script", "personality"]
  },
  {
    bucket: "Workflow automation",
    safeToFix: true,
    approvalRequired: false,
    keywords: ["workflow", "webhook", "routing", "notification", "scheduler", "n8n", "zapier"]
  },
  {
    bucket: "CRM or data issue",
    safeToFix: false,
    approvalRequired: true,
    keywords: ["crm", "hubspot", "gohighlevel", "ghl", "data", "writeback", "field"]
  },
  {
    bucket: "Calendar or booking",
    safeToFix: false,
    approvalRequired: true,
    keywords: ["calendar", "booking", "appointment", "slot", "cal.com", "calendly"]
  },
  {
    bucket: "Live call or transfer",
    safeToFix: false,
    approvalRequired: true,
    keywords: ["transfer", "handoff", "call drop", "telephony", "sip", "dialpad"]
  },
  {
    bucket: "Platform or API",
    safeToFix: true,
    approvalRequired: false,
    keywords: ["api", "token", "schema", "outage", "platform", "vapi", "retell", "elk"]
  }
];

export function classifyWorkItem(text = "") {
  const lower = text.toLowerCase();
  const match = triageRules.find((rule) => rule.keywords.some((keyword) => lower.includes(keyword)));

  if (match) {
    return {
      bucket: match.bucket,
      safeToFix: match.safeToFix,
      approvalRequired: match.approvalRequired
    };
  }

  return {
    bucket: "Agent non-prompt config",
    safeToFix: true,
    approvalRequired: false
  };
}

export function buildPromptPackage(body, mode) {
  const client = body.client || "the selected client";
  const platform = normalisePlatform(body.platform);
  const agentType = normaliseAgentType(body.agentType);
  const voiceStyle = body.voiceStyle || "Warm, concise, professional";
  const llmProvider = normaliseLlmProvider(body.llmProvider);
  const llmModel = normaliseLlmModel(body.llmModel);
  const skillSelection = body.skillSelection || "AI picks skills";
  const autonomy = body.autonomy || "AI-led";
  const sourceBrief = body.sourceBrief || "No discovery brief supplied yet.";
  const previousPrompt = body.previousPrompt || "No previous prompt supplied.";
  const clientFeedback = body.clientFeedback || "No client feedback supplied yet.";
  const optimizationTarget = body.optimizationTarget || "AI selects issues";
  const triage = classifyWorkItem(`${sourceBrief} ${previousPrompt} ${clientFeedback} ${optimizationTarget}`);

  const contextSource =
    mode === "enhance"
      ? `Existing prompt:\n${previousPrompt}\n\nClient feedback:\n${clientFeedback}\n\nOptimization target: ${optimizationTarget}`
      : `Discovery brief:\n${sourceBrief}`;

  const output = `# 1. Role & Objective
You are ${client}'s ${agentType}. Your objective is to handle voice calls accurately, qualify intent, answer approved questions, and route high-intent or sensitive cases to the correct human path.

# 2. Personality & Tone
Use this tone: ${voiceStyle}. Keep responses short enough for live voice. Sound helpful, calm, and direct. Ask one question at a time.

# 3. Context
Platform: ${platform}
LLM provider: ${llmProvider}
LLM model: ${llmModel}
Skill routing: ${skillSelection}
Autonomy: ${autonomy}

Source material:
${contextSource}

# 4. Instructions including Objection Handling
- Open with a concise greeting and identify the caller's intent.
- Collect only the fields required for the current outcome.
- Confirm important details before booking, transferring, or ending the call.
- Handle objections by acknowledging the concern, giving the shortest approved answer, then returning to the next useful step.
- If the caller is confused, slow down and ask a simpler single question.

# 5. Guardrails
A. Safety: do not provide emergency, medical, legal, financial, or safety-critical advice.
B. Off-Topic: redirect politely to the caller's original purpose.
C. Compliance: do not make guarantees, quote unapproved pricing, or invent policy.
D. Authority: do not claim to be a human employee.
E. Data Protection: collect only necessary personal data and never expose internal notes.
F. Transfer/Exit: transfer or schedule a callback when the caller asks for a human, becomes upset, or reaches a restricted topic.

# 6. Stages / Call Flow
Greeting -> Intent -> Qualification -> Answer or Action -> Confirmation -> Transfer / Booking / Close.

# 7. Example Interactions
Caller: "Can you help me book a call?"
Agent: "Yes. I can help with that. What day works best for you?"

Caller: "Can you guarantee the price?"
Agent: "I cannot guarantee pricing. I can arrange a callback with the right person to confirm the details."

# 8. Knowledge Base
Use only approved discovery notes, client wiki patterns, platform recommendations, industry templates, client feedback, and production configuration. If information is missing or conflicting, ask a clarifying question before proceeding.

# 9. Voice Setup Checklist
- LLM: ${llmProvider} / ${llmModel}
- Temperature: ${body.temperature || "0.4"}
- Max tokens: ${body.maxTokens || "4000"}
- Reasoning mode: ${body.reasoningMode || "Balanced"}
- Platform: ${platform}
- STT/TTS/Voice: select during Phase 1 research.
- VAD/turn-taking: tune for short responses and low interruption risk.
- QA: run checklist, scenario tests, and latency review before production.`;

  const blueprint = buildBlueprint({ client, platform, agentType, sourceBrief, triage });
  const callScript = buildCallScript({ client, agentType, voiceStyle });
  const callFlowChart = buildCallFlowChart({ platform });
  const integrationBlueprint = buildIntegrationBlueprint({ client, platform });
  const elkExport = buildElkExport({ client, platform, agentType, output });

  return {
    output,
    blueprint,
    callScript,
    salesScript: callScript,
    callFlowChart,
    agentPrompt: output,
    integrationBlueprint,
    integrationFlowchart: integrationBlueprint,
    elkDescription: elkExport.descriptionTxt,
    elkSchema: elkExport.openaiSchemaJson,
    elkPostBody: elkExport.postBodyJson,
    elkFunctionConfig: elkExport.functionConfigMd,
    elkExport,
    qaChecklist: buildQaChecklist(platform),
    qaGates: qaGateList.join(" "),
    testReport: buildTestReport(mode),
    latencyNotes: buildLatencyNotes(platform),
    deploymentPackage: buildDeploymentPackage(platform, llmProvider, llmModel),
    releasePolicy: triage.approvalRequired
      ? "Approval required before production. Draft exact wording, rationale, QA result, and rollback notes."
      : "Safe operational fix can proceed only with evidence, snapshot, rollback path, and verification result.",
    obsidianLearning: buildObsidianLearningNote({
      client,
      title: `${triage.bucket} learning`,
      bucket: triage.bucket,
      evidence: mode === "enhance" ? clientFeedback : sourceBrief,
      verificationResult: "Add verified lesson after QA or release review."
    })
  };
}

export function buildObsidianLearningNote({
  client,
  title,
  bucket,
  evidence,
  verificationResult
}) {
  return `---
tags:
  - inspra
  - voice-agent-os
  - wiki-learning
client: "${escapeYaml(client || "Unassigned")}"
bucket: "${escapeYaml(bucket || "General")}"
status: draft
---

# ${title || "Voice Agent OS learning"}

## Learning
${evidence || "Capture the reusable lesson, source, and decision here."}

## Verification
${verificationResult || "Add the verification result before this note becomes reusable."}

## Reuse Rule
Apply this lesson only when the client, platform, function category, and approval policy match the original evidence.`;
}

function buildBlueprint({ client, platform, agentType, sourceBrief, triage }) {
  return `# ${client} x Inspra AI Production Blueprint

## Scope
Build a ${agentType} on ${platform} using the supplied discovery material.

## Swimlane Blueprint
Current State -> Fathom notes, existing CRM/calendar, existing handoff process.
Production Build -> ${platform} agent, Inspra prompt package, call script, call flow, integration blueprint.
Monitored Operation -> Platform events, workflow logs, CRM/calendar writeback, release evidence, Obsidian learning.

## Source Material
${sourceBrief}

## Open Questions
- Confirm source of truth for client records.
- Confirm approval owner for prompt, function, workflow, and release changes.
- Confirm monitoring cadence and escalation path.

## Triage Rule
Default bucket: ${triage.bucket}. Safe fix: ${triage.safeToFix ? "yes" : "no"}. Approval required: ${triage.approvalRequired ? "yes" : "no"}.`;
}

function buildCallScript({ client, agentType, voiceStyle }) {
  return `# ${client} Call Script

## Opening
Thanks for calling ${client}. I can help with ${agentType.toLowerCase()} today.

## Qualification
- What are you hoping to get help with?
- Have you worked with us before?
- What timeline are you considering?

## Objections
Use a ${voiceStyle.toLowerCase()} tone. Acknowledge the concern, give the shortest approved answer, and return to the next useful question.

## Close
Confirm the next step, repeat any booking or callback details, and hand off if the caller needs a human.`;
}

function buildCallFlowChart({ platform }) {
  return `Greeting -> Intent -> Collect required fields -> Branch
  Branch: Booking -> Check availability -> Present slots -> Confirm choice -> Book -> Confirm only after success
  Branch: Question -> Answer from approved knowledge -> Ask next useful question
  Branch: Transfer -> Warm transfer if available -> Cold fallback if unavailable
  Branch: Restricted topic -> Refuse safely -> Offer human callback
  Close -> Summary -> End call

Platform notes: validate ${platform} turn-taking, transfer, webhook, and post-call event behavior before launch.`;
}

function buildIntegrationBlueprint({ client, platform }) {
  return `# ${client} Integration Blueprint

## Production Flow
${platform} voice agent -> Tool call router -> Automation layer -> CRM/calendar/notification system
CRM/calendar/notification system -> Success or failure response -> Voice agent confirmation rules
${platform} post-call event -> Monitor -> Work item ledger -> Release manager -> Obsidian wiki learning

## Obsidian Flow
Validated release evidence -> Obsidian note properties -> reusable client learning -> future package context

Client: ${client}`;
}

function buildElkExport({ client, platform, agentType, output }) {
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["caller_name", "caller_phone", "intent", "summary"],
    properties: {
      caller_name: {
        type: "string",
        description: "The caller's full name confirmed by the agent."
      },
      caller_phone: {
        type: "string",
        description: "The callback phone number confirmed by the agent."
      },
      intent: {
        type: "string",
        description: "The caller's primary goal using approved business wording."
      },
      summary: {
        type: "string",
        description: "A concise internal summary of the call and next step."
      }
    }
  };

  const postBody = {
    client,
    platform,
    agent_type: agentType,
    caller_name: "{{caller_name}}",
    caller_phone: "{{caller_phone}}",
    intent: "{{intent}}",
    summary: "{{summary}}",
    source: "voice_agent_os"
  };

  return {
    descriptionTxt: `Use this tool when ${client}'s ${agentType} has collected all required fields and needs to create the approved downstream action. Confirm success only after the webhook returns a success response. If the tool fails, do not claim completion; offer a callback or human handoff.`,
    openaiSchemaJson: JSON.stringify(schema, null, 2),
    postBodyJson: JSON.stringify(postBody, null, 2),
    functionConfigMd: `# Function Config

Label: ${client} action webhook
Name: ${slugify(client)}_${slugify(agentType)}_action
Event key: voice_agent_os.action
Method: POST
Endpoint: https://example.com/webhooks/${slugify(client)}
Headers: Authorization, Content-Type
Response: JSON
Success condition: HTTP 2xx and response.ok is true.
Production validation notes: validate required fields, failure handling, duplicate prevention, and confirmation wording.

## Prompt Reference
${output.slice(0, 1200)}`
  };
}

function buildQaChecklist(platform) {
  return [
    "Role and objective are explicit.",
    "Tone is voice-first and concise.",
    "Guardrails include safety, off-topic, compliance, authority, data protection, and transfer rules.",
    "Functional QA testing covers happy path, objection, off-topic, transfer, webhook failure, and close.",
    "Call flow has clear success, fallback, and exit paths.",
    `Platform readiness checked for ${platform}.`
  ].join(" ");
}

function buildTestReport(mode) {
  const label = mode === "enhance" ? "optimized package" : "new production package";
  return `Prepared functional QA testing report for ${label}: happy path, missing information, objection, restricted question, angry caller, human transfer, silent caller, function failure, booking confirmation, and inbound/outbound scenario fit.`;
}

function buildLatencyNotes(platform) {
  return `Latency review queued for ${platform}: check model response time, STT endpointing, TTS voice latency, VAD sensitivity, and interruption handling.`;
}

function buildDeploymentPackage(platform, llmProvider, llmModel) {
  return `Production package ready for ${platform}: blueprint, call script, call flow chart, system prompt, integration blueprint, Elk function files, LLM config (${llmProvider} / ${llmModel}), QA checklist, validation report, latency notes, approval record, rollback checklist, and Obsidian writeback.`;
}

function normalisePlatform(value) {
  const allowed = new Set(["Elk", "Retell", "Vapi"]);
  return allowed.has(value) ? value : "Elk";
}

function normaliseAgentType(value) {
  const allowed = new Set(["Inbound", "Outbound"]);
  return allowed.has(value) ? value : "Inbound";
}

function normaliseLlmProvider(_value) {
  return "OpenRouter";
}

function normaliseLlmModel(value) {
  return value && String(value).toLowerCase().includes("/") ? value : "OpenRouter auto model";
}

function slugify(value) {
  return String(value || "item")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

function escapeYaml(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
