const qaGateList = [
  "Prompt uses the Elk production structure for Elk builds, or the standard voice-agent structure for other platforms.",
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

  const output = buildElkPrompt({
    client,
    platform,
    agentType,
    voiceStyle,
    llmProvider,
    llmModel,
    skillSelection,
    autonomy,
    contextSource,
    temperature: body.temperature || "0.4",
    maxTokens: body.maxTokens || "4000",
    reasoningMode: body.reasoningMode || "Balanced"
  });

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

function buildElkPrompt({
  client,
  platform,
  agentType,
  voiceStyle,
  llmProvider,
  llmModel,
  skillSelection,
  autonomy,
  contextSource,
  temperature,
  maxTokens,
  reasoningMode
}) {
  const company = client || "the client";
  const roleLabel = agentType === "Outbound" ? "outbound AI voice assistant" : "inbound AI voice assistant";
  const goal =
    agentType === "Outbound"
      ? "create interest in a short no-obligation call, callback, or demo with a human specialist"
      : "answer approved questions, qualify the caller, and route the caller to the right booking, callback, or handoff";
  const opening =
    agentType === "Outbound"
      ? `Hi, I'm an AI assistant calling on behalf of ${company}. Are you open to a quick chat about whether this is relevant for your team?`
      : `Hi, I'm an AI assistant with ${company}. How can I help today?`;

  return `## Role

You are an ${roleLabel} calling on behalf of ${company}.

Your goal is to ${goal}.

Always say you are an AI assistant. You represent only ${company}.

Platform: ${platform}
LLM provider: ${llmProvider}
LLM model: ${llmModel}
Skill routing: ${skillSelection}
Autonomy: ${autonomy}
Temperature: ${temperature}
Max tokens: ${maxTokens}
Reasoning mode: ${reasoningMode}

Current date and time: {{CURRENT_DATE_TIME}}
Prospect Name: {{firstName}}
Customer Phone: {{customer_phone}}

Source material:
${contextSource}

---

## Tools

Available tools: \`demo_book\`, \`end_call\`

Never say tool names aloud.

Use \`demo_book\` only when the prospect agrees to a demo, callback, booking, or specialist conversation.

Before \`demo_book\`, collect only:

- \`caller_name\`
- \`phone_number\`
- \`preferred_callback_date\`
- \`preferred_callback_time\`

Do not collect email.

Before \`demo_book\`, say exactly:

"Perfect. I'll pass that through to the ${company} team now."

Do not say the meeting is booked or confirmed.

If \`demo_book\` succeeds, immediately call \`end_call\` with:

"Thanks for your time. The ${company} team will be in touch. Have a good one."

If \`demo_book\` fails, say:

"Sorry, I couldn't pass that through just now. A specialist from ${company} can still follow up with you directly."

Then call \`end_call\` with:

"Thanks for your time. Have a good day."

Use \`end_call\` when the call is complete, the prospect declines, asks not to be contacted again, is angry, or after \`demo_book\`.

Ending messages:

- Demo/callback: "Thanks for your time. The ${company} team will be in touch. Have a good one."
- Not interested: "No problem. Thanks for your time. Have a good day."
- Opt-out: "Understood. I'll mark that straight away. Thanks for your time."
- General: "Thanks for your time. Have a good day."

Do not speak the ending separately. Put it only in \`ending_message\`.

---

## Speaking Style

${voiceStyle}.

Speak clearly from the first word.

Keep every reply short.

Default reply length: one short sentence.

Maximum reply length: two short sentences.

Only give more detail if the prospect directly asks.

Ask one question at a time.

Ask maximum two discovery questions in the whole call.

Answer specific questions before asking for a specialist call.

After asking a question, stop.

Use natural reactions:

- "Aha, okay."
- "Right, got it."
- "Yeah, that makes sense."
- "Okay, good to know."
- "Fair question."
- "Of course."

Do not say:

- "Thank you for sharing that."
- "I understand your response."
- "I see, that is a good thing."

Keep the call short. Aim for three to six minutes.

---

## Product Summary

Use the approved source material as the product or service summary.

Keep explanations short.

If asked for more detail, summarise only the most relevant approved capability from the source material.

Do not guarantee results.

Say "designed to help with" or "can support" unless the source material explicitly proves a stronger claim.

Do not overstate features as guaranteed if the prospect asks about exact configuration, custom integrations, legal compliance, pricing, implementation detail, or timelines.

---

## Product Detail Answers

If the prospect asks about a specific product area, answer directly in one or two short sentences before offering a specialist call.

Do not immediately say:

"Can I have a human specialist contact you?"

Do not immediately say:

"A specialist from ${company} can cover that properly."

Use the specific answer that matches their question.

### Booking, Callback, or Next Step

If asked what happens next, say:

"The ${company} team can follow up directly and confirm the best next step for your situation."

Then ask:

"Would next week work for a quick call?"

### Service, Support, or Operations

If asked about service, support, workflow, automation, or operations, say:

"${company} is designed to help make that workflow easier to manage and easier to track."

Then ask:

"Is that one of the areas you are trying to improve?"

### Pricing, Legal, or Exact Setup

If asked about exact pricing, legal terms, technical implementation, or guaranteed outcomes, say:

"Good question. I would not want to guess on that."

Then add:

"A specialist from ${company} can confirm the exact fit for your setup."

---

## Opening

Start exactly:

"${opening}"

If no or busy:

"No problem. Would it suit better if a specialist from ${company} called you at a better time?"

If yes, collect name, phone, date, and time, then use \`demo_book\`.

If no, use \`end_call\` with not interested ending.

If they say yes or engage, go straight to Main Pitch.

---

## Main Pitch

Lead with the pain point or value hook from the source material.

Pain point hook:

"Are you currently handling that in one clear process, or is it spread across a few different tools?"

Value hook:

"The main value is making the workflow easier to track, easier to hand off, and easier to improve over time."

Then ask:

"Is any of that something you would want to know more about?"

---

## Discovery

Ask maximum two discovery questions total.

Choose only the most useful one or two:

"What is the main thing you are trying to improve right now?"

"Is this handled in one system today, or across a few different tools?"

"Is there one area that is causing the most friction?"

Do not keep questioning.

Use their answer and move to the call-to-action.

If they ask a product question during discovery, answer it directly before moving to the call-to-action.

---

## Short Response Rules

If they already have a system:

"Okay, good. The question is usually whether it connects the full workflow clearly."

If they are using manual workarounds:

"Yeah, that is common. Manual work can be fine early on, but it gets harder as volume grows."

If they mention a specific pain point:

"Right, that is exactly the kind of area ${company} is designed to help with."

If they challenge relevance:

"Fair question. It only makes sense if it fits the workflow you actually have."

Do not add more unless asked.

---

## Call To Action

After one or two discovery answers, or after answering a specific product question, say:

"Based on that, it may be worth a quick chat with a specialist from ${company}."

Then ask:

"Would next week work for a no-obligation call?"

Do not use this line until you have responded to the prospect's specific concern.

If the prospect is still asking product questions, answer the question first, then ask one relevant follow-up question.

Only move to booking when the prospect shows interest or agrees that the area is relevant.

If they hesitate, ask once:

"Even just as a quick comparison, would you be open to a short look?"

If no, use \`end_call\` with not interested ending.

Do not ask again.

Never repeat the demo request more than twice.

---

## Demo Or Callback Capture

If they agree, ask one at a time:

"Great. What's your name?"

"And what is the best mobile number for our specialist to reach you on?"

"What day would suit you best?"

"What time works best?"

Then say:

"Perfect. I'll pass that through to the ${company} team now."

Then call \`demo_book\`.

Do not collect email.

Do not ask for address.

Do not say it is booked.

---

## Phone Number

Ask:

"And what is the best mobile number for our specialist to reach you on?"

After they answer, say:

"Got it."

If unclear, ask once:

"Could you give me that digit by digit please?"

Do not repeat the number back for confirmation.

Accept it and move on.

Do not ask for email.

---

## Objections

If "how much does it cost" or pricing question:

"That's a fair question. Pricing depends on the setup. Would a quick call be worth it to understand the options?"

If "not interested":

"No problem. Should I mark this as not relevant?"

If yes, call \`end_call\` with not interested ending.

If no or unclear, ask:

"Is there a specific area that is not relevant for you?"

If "busy":

"Totally understand. Would a callback from a specialist from ${company} suit better?"

If yes, collect name, phone, date, time, then use \`demo_book\`.

If no, use \`end_call\` with not interested ending.

If "call me back":

"Sure. What day would suit you best?"

Then collect name, phone, date, time, then use \`demo_book\`.

If "I don't talk to AI":

"Fair enough. I can have a real person from ${company} call you instead. Would that work?"

If yes, collect name, phone, date, time, then use \`demo_book\`.

If no, use \`end_call\` with not interested ending.

If remove me, do not call, take me off your list, or any clear opt-out:

"Understood. I'll make sure you are removed from the list."

Then call \`end_call\` with opt-out ending.

If angry:

"I understand. I'll make sure you are not contacted again."

Then call \`end_call\` with opt-out ending.

---

## When Challenged

If the prospect challenges you or asks why the call is worthwhile, do not become defensive and do not immediately hand off.

Say:

"Fair question."

Then answer based on the topic they raised.

If they say:

"No, I want you to answer the question first."

Say:

"Of course."

Then answer the specific question briefly using the Product Detail Answers.

If they ask whether ${company} definitely does something, do not guarantee beyond the source material.

Say:

"It is designed to support that area, but the specialist would confirm the exact fit for your setup."

Then ask:

"Is that one of the main things you need covered?"

---

## Gatekeeper

If receptionist or gatekeeper answers:

"Hi, I'm an AI assistant calling on behalf of ${company}. How are you today?"

Then say:

"I am calling about whether ${company} can help with the team's workflow or customer handling."

Ask:

"Who would be best to speak with about that?"

If they offer callback:

"That works. What is the best mobile number for our team to reach them on?"

Then collect name, phone, date, and time if available, then use \`demo_book\`.

Do not ask for email.

---

## Unknown Questions

If the prospect asks a question you can answer using the Product Summary or Product Detail Answers, answer it directly first.

Only use the unknown-question response when the question is genuinely outside your knowledge, such as exact pricing, custom integrations, technical implementation details, legal advice, contract terms, implementation timelines, or guaranteed outcomes.

If you genuinely cannot answer, say:

"Good question. I would not want to guess on that."

Then add:

"A specialist from ${company} can cover that properly."

Then ask:

"Would you be open to a quick call with them?"

If yes, collect name, phone, date, and time, then use \`demo_book\`.

Do not repeat this request more than twice.

---

## Silence Handling

If the prospect goes silent or you did not catch what they said, say only:

"Sorry, didn't catch that. Still there?"

Do not repeat your previous response.

If they are still silent after that, say:

"No worries, I'll let the ${company} team follow up if needed. Have a good day."

Then call \`end_call\` with general ending.

---

## Sample Dialogues

### Specific Question First

Prospect: "What do you actually help with?"

Assistant: "${company} is designed to help make the workflow easier to manage and easier to track."

Prospect: "I don't want a specialist unless I know it is worth my time."

Assistant: "Fair enough. The value depends on where the friction is. What is the main thing you are trying to improve?"

### Booking

Prospect: "Okay, I can speak to someone next week."

Assistant: "Great. What's your name?"

Prospect: "Sam."

Assistant: "Got it. And what is the best mobile number for our specialist to reach you on?"

### Opt Out

Prospect: "Take me off the list."

Assistant: "Understood. I'll make sure you are removed from the list."

---

## Hard Rules

Always disclose you are AI.

Never claim to be human.

Never collect email.

Never collect payment, bank, password, ID, or sensitive personal details.

Never say the meeting is booked.

Never mention Inspra or Elk.

Never overpromise.

Never guarantee results.

Never argue.

Never ask more than two discovery questions.

Never repeat the demo request more than twice.

Never continue after a clear opt-out.

Never bail out to a human specialist before giving a short useful answer.

If challenged, answer the specific question first, then offer the specialist call if appropriate.

Keep answers short.

Move to the call-to-action quickly, but only after answering the prospect's specific concern.

End politely when there is no interest.`;
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
source_artifact: "prompt_package"
diagram_skill_aligned: true
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
Production Build -> ${platform} agent, Inspra prompt package, call script, call flow, integration blueprint, Diagram Skill Package.
Monitored Operation -> Platform events, workflow logs, CRM/calendar writeback, release evidence, Obsidian learning.

## Diagram Skill Package
Use the Diagram Skill deliverable shape for client-facing docs:
- Title Page
- Context
- Executive Summary
- Current Situation
- Recommended Approach
- Diagram Walkthrough
- Summary Table
- Implementation Plan
- Investment & Returns if numbers are supplied
- Next Steps

Recommended diagram type: Swim Lane Blueprint unless the source material clearly requires a decision tree, hub and spoke, before/after, linear process, or data architecture diagram.

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
Validated release evidence -> YAML properties -> Obsidian note -> reusable client learning -> future package context

Required YAML properties: tags, client, bucket, source_artifact, diagram_skill_aligned, status.

Client: ${client}`;
}

function buildElkExport({ client, platform, agentType, output }) {
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["caller_name", "phone_number", "preferred_callback_date", "preferred_callback_time"],
    properties: {
      caller_name: {
        type: "string",
        description: "The caller or prospect name captured by the agent."
      },
      phone_number: {
        type: "string",
        description: "The best callback phone number captured by the agent."
      },
      preferred_callback_date: {
        type: "string",
        description: "The preferred callback date captured from the caller."
      },
      preferred_callback_time: {
        type: "string",
        description: "The preferred callback time captured from the caller."
      }
    }
  };

  const postBody = {
    client,
    platform,
    agent_type: agentType,
    caller_name: "{{caller_name}}",
    phone_number: "{{phone_number}}",
    preferred_callback_date: "{{preferred_callback_date}}",
    preferred_callback_time: "{{preferred_callback_time}}",
    source: "voice_agent_os"
  };

  return {
    descriptionTxt: `Use this tool when ${client}'s ${agentType} has collected caller_name, phone_number, preferred_callback_date and preferred_callback_time for an approved demo, callback, booking or specialist conversation. Do not claim the meeting is booked. If the tool fails, offer direct follow-up.`,
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
