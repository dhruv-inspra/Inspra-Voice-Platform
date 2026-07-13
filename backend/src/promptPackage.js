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
  const attachmentSource = buildAttachmentSource(body.attachments);
  const sourceBrief = [body.sourceBrief || "No discovery brief supplied yet.", attachmentSource].filter(Boolean).join("\n\n");
  const previousPrompt = body.previousPrompt || "No previous prompt supplied.";
  const clientFeedback = [body.clientFeedback || "No client feedback supplied yet.", attachmentSource].filter(Boolean).join("\n\n");
  const optimizationTarget = body.optimizationTarget || "AI selects issues";
  const triage = classifyWorkItem(`${sourceBrief} ${previousPrompt} ${clientFeedback} ${optimizationTarget}`);

  const sourceProfile =
    mode === "enhance"
      ? buildSourceProfile(`${previousPrompt}\n\n${clientFeedback}\n\n${optimizationTarget}`, client)
      : buildSourceProfile(sourceBrief, client);

  const output = buildElkPrompt({
    client,
    agentType,
    voiceStyle,
    sourceProfile
  });

  const blueprint = buildBlueprint({ client, platform, agentType, sourceBrief: sourceProfile.summary, triage, sourceProfile });
  const callScript = buildCallScript({ client, agentType, voiceStyle, sourceProfile });
  const callFlowChart = buildCallFlowChart({ platform, sourceProfile });
  const integrationBlueprint = buildIntegrationBlueprint({ client, platform, sourceProfile });
  const elkExport = buildElkExport({ client, platform, agentType, output });

  const packageOutput = {
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

  return filterRequestedDocs(packageOutput, body.requestedDocs);
}

export async function buildPromptPackageWithOpenRouter(body, mode, options = {}) {
  const packageOutput = buildPromptPackage(body, mode);
  const apiKey = resolveOpenRouterApiKey(options.apiKey);

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is required for LLM generation.");
  }

  try {
    const generatedPrompt = await generatePromptWithOpenRouter({
      body,
      mode,
      draftPrompt: packageOutput.output,
      apiKey,
      fetchImpl: options.fetchImpl || fetch
    });
    const generatedDocs = await generateDocsWithOpenRouter({
      body,
      mode,
      packageOutput,
      apiKey,
      fetchImpl: options.fetchImpl || fetch
    });
    const platform = normalisePlatform(body.platform);
    const agentType = normaliseAgentType(body.agentType);
    const client = body.client || "the selected client";
    const elkExport = buildElkExport({ client, platform, agentType, output: generatedPrompt });

    return {
      ...packageOutput,
      ...generatedDocs,
      output: generatedPrompt,
      agentPrompt: generatedPrompt,
      elkDescription: elkExport.descriptionTxt,
      elkSchema: elkExport.openaiSchemaJson,
      elkPostBody: elkExport.postBodyJson,
      elkFunctionConfig: elkExport.functionConfigMd,
      elkExport,
      generationProvider: "openrouter",
      generationModel: resolveOpenRouterModel(body.llmModel)
    };
  } catch (error) {
    return {
      ...packageOutput,
      generationProvider: "local-template",
      generationNote: `OpenRouter generation failed, so the local production template was used. ${error.message}`
    };
  }
}

function resolveOpenRouterApiKey(value) {
  const candidate = value ?? process.env.OPENROUTER_API_KEY;
  return String(candidate || "").trim();
}

function filterRequestedDocs(packageOutput, requestedDocs) {
  if (!Array.isArray(requestedDocs) || requestedDocs.length === 0) return packageOutput;

  const selected = new Set(requestedDocs.map(normaliseDocName));
  const next = { ...packageOutput, requestedDocs };

  if (!selected.has("Blueprint")) {
    next.blueprint = "";
  }
  if (!selected.has("Call script")) {
    next.callScript = "";
    next.salesScript = "";
  }
  if (!selected.has("Call flow")) {
    next.callFlowChart = "";
  }
  if (!selected.has("Integration blueprint")) {
    next.integrationBlueprint = "";
    next.integrationFlowchart = "";
  }
  if (!selected.has("Elk builder")) {
    next.elkDescription = "";
    next.elkSchema = "";
    next.elkPostBody = "";
    next.elkFunctionConfig = "";
  }

  return next;
}

function normaliseDocName(value) {
  const name = String(value || "").trim().toLowerCase();
  if (name === "script" || name === "call guide") return "Call script";
  if (name === "integration guide") return "Integration blueprint";
  if (name === "elk builder") return "Elk builder";
  if (name === "call flow") return "Call flow";
  if (name === "blueprint") return "Blueprint";
  return value;
}

function buildAttachmentSource(attachments = []) {
  if (!Array.isArray(attachments) || attachments.length === 0) return "";
  const lines = ["Attached source files:"];

  attachments.slice(0, 10).forEach((file, index) => {
    const name = String(file?.name || `Attachment ${index + 1}`).slice(0, 120);
    const type = String(file?.type || "unknown");
    const size = Number(file?.size || 0);
    lines.push(`- ${name} (${type}, ${size} bytes)`);
    if (file?.text) {
      lines.push(String(file.text).slice(0, 12000));
    } else if (file?.dataUrl && type.startsWith("image/")) {
      lines.push("Image attachment supplied for model review.");
    } else {
      lines.push("Binary attachment supplied. Use the filename and any extracted text provided by the browser.");
    }
  });

  return lines.join("\n");
}

async function generatePromptWithOpenRouter({ body, mode, draftPrompt, apiKey, fetchImpl }) {
  const model = resolveOpenRouterModel(body.llmModel);
  const attachmentSource = buildAttachmentSource(body.attachments);
  const userContent = buildOpenRouterUserContent({
    text: `Rewrite and improve this ${mode === "enhance" ? "revised" : "new"} voice-agent prompt so it is production-ready, concise, and aligned with the approved business facts already distilled inside it.\n\nRules:\n- Preserve tool names and required tool-call sequencing exactly.\n- Preserve all variables exactly, including {{CURRENT_DATE_TIME}}, {{firstName}}, and {{customer_phone}}.\n- Preserve all hard safety rules.\n- Make product answers specific to the approved product knowledge.\n- Do not invent new facts, pricing, legal claims, integrations, or guarantees.\n- Do not mention source material, transcripts, recordings, OpenRouter, Elk, model settings, or internal tools.\n\n${attachmentSource ? `Additional attached source material to consider without quoting raw metadata:\n${attachmentSource}\n\n` : ""}Draft prompt:\n${draftPrompt}`,
    attachments: body.attachments
  });
  const response = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.PUBLIC_APP_URL || process.env.CLIENT_URL || "http://localhost:5173",
      "X-OpenRouter-Title": "Inspra AI Voice Platform"
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You create production-ready AI voice assistant prompts. Return only the final prompt markdown. Do not include analysis, explanations, raw transcript excerpts, meeting metadata, platform names, model names, or internal implementation notes."
        },
        {
          role: "user",
          content: userContent
        }
      ],
      temperature: Number(body.temperature || 0.4),
      max_tokens: Number(body.maxTokens || 4000)
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 240)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("OpenRouter returned no message content.");
  }

  return content.trim();
}

async function generateDocsWithOpenRouter({ body, mode, packageOutput, apiKey, fetchImpl }) {
  const requestedDocs = Array.isArray(body.requestedDocs) ? body.requestedDocs.map(normaliseDocName) : [];
  if (!requestedDocs.length) return {};

  const model = resolveOpenRouterModel(body.llmModel);
  const docsBrief = [
    `Client: ${body.client || "Selected client"}`,
    `Mode: ${mode}`,
    `Requested documents: ${requestedDocs.join(", ")}`,
    "",
    "Source notes:",
    body.sourceBrief || "",
    "",
    "Draft artifacts:",
    packageOutput.blueprint,
    packageOutput.callScript,
    packageOutput.callFlowChart,
    packageOutput.integrationBlueprint
  ].join("\n");

  const response = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.PUBLIC_APP_URL || process.env.CLIENT_URL || "http://localhost:5173",
      "X-OpenRouter-Title": "Inspra AI Voice Platform"
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You create client-facing AI voice-agent documentation using the Diagram-Skill-v2 delivery standard. Return strict JSON only with keys blueprint, callScript, callFlowChart, integrationBlueprint. Use plain business language. Do not output Python, matplotlib code, code fences, implementation code, raw transcript excerpts, recording metadata, or internal model/platform settings."
        },
        {
          role: "user",
          content: buildOpenRouterUserContent({
            text: `${docsBrief}\n\nDiagram-Skill-v2 rules:\n- Brand is Inspra AI.\n- Use the swim lane blueprint as the default diagram type unless the source clearly requires another type.\n- The blueprint must follow this client-facing companion write-up structure exactly: Title Page, Context, Executive Summary, Current Situation, Recommended Approach, Diagram Walkthrough, Summary Table, Implementation Plan, Next Steps.\n- The Diagram Walkthrough must describe three aligned swim lanes: Current State, Proposed Phase 1, and Monitored Operation.\n- Include system/component names, roles, data movement, ownership, open questions, and next steps.\n- Call flow should be a readable decision/process flow in business language, not source code.\n- Integration blueprint should describe systems, data movement, ownership, handoffs, failure handling, and open questions.\n- Call script should be production-ready voice copy.\n- Never include Python, Mermaid, pseudo-code, code fences, or raw transcript lines.\n- Leave non-requested keys as empty strings.`,
            attachments: body.attachments
          })
        }
      ],
      temperature: Number(body.temperature || 0.4),
      max_tokens: Number(body.maxTokens || 4000)
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Docs HTTP ${response.status}: ${text.slice(0, 240)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("OpenRouter returned no docs content.");
  }

  const docs = parseJsonObject(content);
  return filterRequestedDocs(
    {
      blueprint: String(docs.blueprint || packageOutput.blueprint || ""),
      callScript: String(docs.callScript || packageOutput.callScript || ""),
      salesScript: String(docs.callScript || packageOutput.salesScript || ""),
      callFlowChart: String(docs.callFlowChart || packageOutput.callFlowChart || ""),
      integrationBlueprint: String(docs.integrationBlueprint || packageOutput.integrationBlueprint || ""),
      integrationFlowchart: String(docs.integrationBlueprint || packageOutput.integrationFlowchart || "")
    },
    requestedDocs
  );
}

function parseJsonObject(content) {
  const trimmed = content.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("OpenRouter docs response was not valid JSON.");
  }
}

function buildOpenRouterUserContent({ text, attachments = [] }) {
  const imageAttachments = Array.isArray(attachments)
    ? attachments.filter((file) => file?.dataUrl && String(file.type || "").startsWith("image/")).slice(0, 4)
    : [];

  if (!imageAttachments.length) return text;

  return [
    { type: "text", text },
    ...imageAttachments.map((file) => ({
      type: "image_url",
      image_url: { url: file.dataUrl }
    }))
  ];
}

function resolveOpenRouterModel(value) {
  const model = normaliseLlmModel(value);
  return model === "OpenRouter auto model" ? "~openai/gpt-latest" : model;
}

function buildElkPrompt({
  client,
  agentType,
  voiceStyle,
  sourceProfile
}) {
  const company = client || "the client";
  const displayName = sourceProfile.companyName || company;
  const roleLabel = agentType === "Outbound" ? "outbound AI voice assistant" : "inbound AI voice assistant";
  const goal =
    agentType === "Outbound"
      ? `warm qualified leads, answer approved questions, and encourage a booked call with ${sourceProfile.specialistName}`
      : `help eligible callers understand ${displayName}, answer approved questions, and encourage a booked call with ${sourceProfile.specialistName}`;
  const opening =
    agentType === "Outbound"
      ? `Hi, I'm an AI assistant calling on behalf of ${displayName}. Is now an okay time for a quick question?`
      : `Hi, I'm an AI assistant with ${displayName}. How can I help today?`;
  const productBullets = sourceProfile.productFacts.map((item) => `- ${item}`).join("\n");
  const useCases = sourceProfile.useCases.map((item) => `- ${item}`).join("\n");
  const qualifiers = sourceProfile.qualifiers.map((item) => `- ${item}`).join("\n");
  const disqualifiers = sourceProfile.disqualifiers.map((item) => `- ${item}`).join("\n");
  const handoffFacts = sourceProfile.handoffFacts.map((item) => `- ${item}`).join("\n");
  const discoveryQuestions = sourceProfile.discoveryQuestions.map((item) => `"${item}"`).join("\n\n");

  return `## Role

You are an ${roleLabel} for ${displayName}.

Your goal is to ${goal}.

Always say you are an AI assistant. You represent only ${displayName}.

Current date and time: {{CURRENT_DATE_TIME}}
Prospect Name: {{firstName}}
Customer Phone: {{customer_phone}}

Approved product knowledge:
${productBullets}

Approved use cases:
${useCases}

Initial fit signals:
${qualifiers}

Do not progress as a likely fit when:
${disqualifiers}

Human handoff facts:
${handoffFacts}

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

"Perfect. I'll pass that through to the ${displayName} team now."

Do not say the meeting is booked or confirmed.

If \`demo_book\` succeeds, immediately call \`end_call\` with:

"Thanks for your time. The ${displayName} team will be in touch. Have a good one."

If \`demo_book\` fails, say:

"Sorry, I couldn't pass that through just now. A specialist from ${displayName} can still follow up with you directly."

Then call \`end_call\` with:

"Thanks for your time. Have a good day."

Use \`end_call\` when the call is complete, the prospect declines, asks not to be contacted again, is angry, or after \`demo_book\`.

Ending messages:

- Demo/callback: "Thanks for your time. The ${displayName} team will be in touch. Have a good one."
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

Use only the approved product knowledge, use cases, fit signals, and handoff facts above.

Keep explanations short.

If asked for more detail, summarise only the most relevant approved capability from the approved knowledge above.

Do not guarantee results.

Say "designed to help with" or "can support" unless the approved knowledge above proves a stronger claim.

Do not overstate features as guaranteed if the prospect asks about exact configuration, custom integrations, legal compliance, pricing, implementation detail, or timelines.

---

## Product Detail Answers

If the prospect asks about a specific product area, answer directly in one or two short sentences before offering a specialist call.

Do not immediately say:

"Can I have a human specialist contact you?"

Do not immediately say:

"A specialist from ${displayName} can cover that properly."

Use the specific answer that matches their question.

### Booking, Callback, or Next Step

If asked what happens next, say:

"The ${displayName} team can follow up directly and confirm the best next step for your situation."

Then ask:

"Would next week work for a quick call?"

### Service, Support, or Operations

If asked about service, support, workflow, automation, or operations, say:

"${sourceProfile.serviceAnswer}"

Then ask:

"Is that one of the areas you are trying to improve?"

### Pricing, Legal, or Exact Setup

If asked about exact pricing, legal terms, technical implementation, or guaranteed outcomes, say:

"Good question. I would not want to guess on that."

Then add:

"A specialist from ${displayName} can confirm the exact fit for your situation."

---

## Opening

Start exactly:

"${opening}"

If no or busy:

"No problem. Would it suit better if a specialist from ${displayName} called you at a better time?"

If yes, collect name, phone, date, and time, then use \`demo_book\`.

If no, use \`end_call\` with not interested ending.

If they say yes or engage, go straight to Main Pitch.

---

## Main Pitch

Lead with the most relevant need from the approved use cases.

Pain point hook:

"${sourceProfile.painHook}"

Value hook:

"${sourceProfile.valueHook}"

Then ask:

"Is any of that something you would want to know more about?"

---

## Discovery

Ask maximum two discovery questions total.

Choose only the most useful one or two:

${discoveryQuestions}

Do not keep questioning.

Use their answer and move to the call-to-action.

If they ask a product question during discovery, answer it directly before moving to the call-to-action.

---

## Short Response Rules

If they already have a system:

"${sourceProfile.alreadyHasSystemResponse}"

If they are using manual workarounds:

"${sourceProfile.manualWorkaroundResponse}"

If they mention a specific pain point:

"${sourceProfile.painPointResponse}"

If they challenge relevance:

"Fair question. It only makes sense if it fits the workflow you actually have."

Do not add more unless asked.

---

## Call To Action

After one or two discovery answers, or after answering a specific product question, say:

"Based on that, it may be worth a quick chat with ${sourceProfile.specialistName}."

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

"Perfect. I'll pass that through to the ${displayName} team now."

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

"Totally understand. Would a callback from a specialist from ${displayName} suit better?"

If yes, collect name, phone, date, time, then use \`demo_book\`.

If no, use \`end_call\` with not interested ending.

If "call me back":

"Sure. What day would suit you best?"

Then collect name, phone, date, time, then use \`demo_book\`.

If "I don't talk to AI":

"Fair enough. I can have ${sourceProfile.specialistName} or the team call you instead. Would that work?"

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

If they ask whether ${displayName} definitely does something, do not guarantee beyond the approved product knowledge.

Say:

"It is designed to support that area, but the specialist would confirm the exact fit for your setup."

Then ask:

"Is that one of the main things you need covered?"

---

## Gatekeeper

If receptionist or gatekeeper answers:

"Hi, I'm an AI assistant calling on behalf of ${displayName}. How are you today?"

Then say:

"I am calling about a lending enquiry and whether a call with ${sourceProfile.specialistName} would be useful."

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

"A specialist from ${displayName} can cover that properly."

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

"No worries, I'll let the ${displayName} team follow up if needed. Have a good day."

Then call \`end_call\` with general ending.

---

## Sample Dialogues

### Specific Question First

Prospect: "What do you actually help with?"

Assistant: "${displayName} may help homeowners access property equity when standard serviceability does not fit."

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

Never mention internal tools, platform names, model names, meeting recordings, transcripts, or source notes.

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

function buildSourceProfile(sourceText = "", fallbackClient = "the client") {
  const source = String(sourceText || "");
  const cleanSource = sanitiseSourceMaterial(source);
  const lower = cleanSource.toLowerCase();
  const companyName = inferCompanyName(cleanSource, fallbackClient);
  const specialistName = lower.includes("amanda") ? "Amanda" : "a specialist";
  const isMortgageLender =
    /mortgage|home loan|equity|serviceability|regulated lender|reverse mortgage/i.test(cleanSource);

  if (isMortgageLender) {
    return {
      companyName,
      specialistName,
      summary:
        `${companyName} is a regulated lender that helps eligible homeowners access cash secured by a first or second mortgage. ` +
        "The product is for people who have property equity but may not meet standard bank serviceability rules.",
      productFacts: [
        `${companyName} provides loans secured by a first or second mortgage, with most enquiries relating to second mortgages.`,
        "The product is designed for homeowners with equity who want to convert some of that equity into cash.",
        "Common reasons include school fees, renovations, business funding, or other major funding needs.",
        "Interest is added to the loan rather than paid as a normal monthly repayment.",
        `${companyName} may share in the property's capital growth when the loan is repaid.`,
        "Repayment is event-driven, such as sale of the home or voluntary repayment, rather than a fixed standard loan term.",
        `${companyName} is a regulated lender, so exact suitability and pricing must be confirmed by the human team.`
      ],
      useCases: [
        "The caller has checked eligibility and wants to understand whether the product could fit.",
        "The caller has been declined by a bank or expects standard serviceability to be difficult.",
        "The caller wants to understand how no monthly repayments can work.",
        "The caller needs enough confidence to book a short call with Amanda."
      ],
      qualifiers: [
        "They own a house, apartment, or investment property.",
        "They have available equity in the property.",
        "They can provide the property value, current mortgage position, requested amount, and postcode if asked.",
        "They are open to a 20-minute Calendly call with Amanda."
      ],
      disqualifiers: [
        "They need unsecured lending, a boat loan, or funding not connected to property equity.",
        "They mention bankruptcy, serious hardship, leasehold title, company or trust ownership, or a high-rise apartment over the usual policy range.",
        "They ask for final credit approval, legal advice, guaranteed eligibility, or exact pricing on the call."
      ],
      handoffFacts: [
        "The assistant should not replace Amanda or give final credit advice.",
        "The best outcome is to warm the caller and encourage a call with Amanda.",
        "Calls are usually 20-minute Calendly bookings and are often completed in about 15 minutes.",
        "If a caller wants a human, offer a callback or booked call rather than continuing to push the AI conversation.",
        "Post-call notes should support CRM follow-up, but the voice prompt should not mention transcripts unless asked internally."
      ],
      serviceAnswer: `${companyName} helps homeowners access equity when a standard lender may not fit their circumstances.`,
      painHook: "Are you looking at this because a bank loan is not quite working for what you need?",
      valueHook: `The main value is that ${companyName} may help convert property equity into funds without monthly repayments.`,
      discoveryQuestions: [
        "What are you hoping to use the funds for?",
        "Have you already checked your eligibility on the website?",
        "Is the property a house, apartment, or investment property?"
      ],
      alreadyHasSystemResponse: `Okay, good. If you have checked eligibility, the best next step is usually a short call with ${specialistName}.`,
      manualWorkaroundResponse: `Yeah, that is common. Many people look at ${companyName} after a bank loan does not fit their serviceability position.`,
      painPointResponse: `Right, that is exactly the kind of situation ${companyName} may be able to look at.`
    };
  }

  return {
    companyName,
    specialistName,
    summary: cleanSource || `${companyName} needs a concise production voice prompt based on approved source notes.`,
    productFacts: buildFallbackBullets(cleanSource, companyName, "product"),
    useCases: buildFallbackBullets(cleanSource, companyName, "use case"),
    qualifiers: [
      "The caller has a relevant need.",
      "The caller is open to a short specialist conversation.",
      "The caller can share a name, phone number, preferred date, and preferred time for follow-up."
    ],
    disqualifiers: [
      "The caller asks for exact pricing, legal advice, guaranteed outcomes, or technical commitments.",
      "The caller opts out or asks not to be contacted."
    ],
    handoffFacts: [
      "Answer briefly from approved knowledge first.",
      "When fit is likely, offer a specialist callback.",
      "Do not collect email or sensitive personal details."
    ],
    serviceAnswer: `${companyName} can support the approved service area described in the source notes.`,
    painHook: "Is this something you are actively looking into right now?",
    valueHook: `The main value is helping you understand whether ${companyName} is relevant before a specialist follow-up.`,
    discoveryQuestions: [
      "What is the main thing you are trying to improve right now?",
      "Is there one area that is causing the most friction?"
    ],
    alreadyHasSystemResponse: "Okay, good. The question is usually whether the current approach covers the full need clearly.",
    manualWorkaroundResponse: "Yeah, that is common. Manual work can be fine early on, but it gets harder as volume grows.",
    painPointResponse: `Right, that is the kind of area ${companyName} may be able to discuss with you.`
  };
}

function sanitiseSourceMaterial(source) {
  return String(source || "")
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      if (/^\d{1,2}:\d{2}\s*-/.test(trimmed)) return false;
      if (/view recording|no highlights|impromptu zoom|transcript|fathom/i.test(trimmed)) return false;
      if (/^(amanda|anthony|phil|tarique|dhruv|vishalli)\b/i.test(trimmed)) return false;
      return true;
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferCompanyName(source, fallbackClient) {
  const fallback = fallbackClient && fallbackClient !== "Default workspace" ? fallbackClient : "the company";
  const midkeyMatch = source.match(/\bMidkey\b/i);
  if (midkeyMatch) return "Midkey";
  const automateMatch = source.match(/\bAutomate\s*K\b/i);
  if (automateMatch) return "Automate K";
  return fallback;
}

function buildFallbackBullets(cleanSource, companyName, label) {
  const sentences = cleanSource
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 30 && item.length < 220)
    .slice(0, 5);

  if (sentences.length) return sentences;

  return [
    `${companyName} needs the assistant to answer only from approved business information.`,
    `If the caller asks beyond the approved ${label} information, the assistant should offer a specialist follow-up.`
  ];
}

function buildBlueprint({ client, platform, agentType, sourceBrief, triage, sourceProfile }) {
  return `# ${client} x Inspra AI Production Blueprint

## Title Page
Document title: ${client} AI Voice Agent Blueprint
Client: ${client}
Prepared by: Inspra AI
Version: v1

## Context
${sourceProfile?.summary || sourceBrief}

## Executive Summary
Build a ${agentType} voice agent that answers only from approved source material, keeps the conversation concise, and routes qualified callers to the right next step.

## Swimlane Blueprint
Current State -> approved discovery notes, existing CRM/calendar, existing handoff process.
Production Build -> ${platform} agent, Inspra prompt package, call script, call flow, integration blueprint, Diagram Skill Package.
Monitored Operation -> Platform events, workflow logs, CRM/calendar writeback, release evidence, Obsidian learning.

## Current Situation
${sourceBrief}

## Recommended Approach
Use a voice-first assistant that gives short approved answers, asks no more than two discovery questions, and moves to booking or callback only when the caller shows fit.

Recommended diagram type: Swim Lane Blueprint unless the source material clearly requires a decision tree, hub and spoke, before/after, linear process, or data architecture diagram.

## Diagram Walkthrough
Current State -> Production Build -> Monitored Operation.

## Summary Table
| Component | Role | Impact |
|---|---|---|
| Voice agent | First response and qualification | Faster caller handling |
| Human specialist | Final fit, pricing, and exact next step | Keeps regulated or nuanced decisions human-led |
| CRM/calendar workflow | Record, callback, and booking handoff | Clear operational follow-through |

## Implementation Plan
1. Confirm approved knowledge and disqualifiers.
2. Build and test prompt, tools, and handoff behavior.
3. Validate CRM/calendar writeback and failure handling.
4. Run scenario QA before production.

## Open Questions
- Confirm source of truth for client records.
- Confirm approval owner for prompt, function, workflow, and release changes.
- Confirm monitoring cadence and escalation path.

## Next Steps
- Review this blueprint against the source material.
- Confirm missing integration details.
- Approve the prompt and tool behavior before launch.

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
