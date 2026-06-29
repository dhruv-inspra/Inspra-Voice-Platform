import "dotenv/config";
import cors from "cors";
import express from "express";
import morgan from "morgan";
import { requireAuth, requireAdmin } from "./authMiddleware.js";
import { createUserDoc, deleteUserDoc, listUserCollection, updateUserDoc } from "./supabaseData.js";
import { isSupabaseReady, isAdminConfigured } from "./supabaseClient.js";
import { acceptInvite, createInvite, listInvites } from "./invites.js";
import { listMembers, setMemberRole } from "./team.js";
import { isEmailConfigured } from "./email.js";

const app = express();
const port = process.env.PORT || 5000;

app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173", credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    supabaseReady: isSupabaseReady(),
    adminReady: isAdminConfigured(),
    emailReady: isEmailConfigured()
  });
});

app.get("/api/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// --- Invite-only access (mirrors WSC) ---

// Public: an invitee accepts their invitation and an account is created.
app.post("/api/invite/accept", async (req, res, next) => {
  try {
    const result = await acceptInvite({
      token: req.body.token,
      fullName: req.body.fullName,
      password: req.body.password
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

// Admin: create an invitation, returns a shareable accept URL.
app.post("/api/invite", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const baseUrl = process.env.PUBLIC_APP_URL || process.env.CLIENT_URL || "http://localhost:5173";
    const result = await createInvite({
      email: req.body.email,
      role: req.body.role || "member",
      invitedBy: req.user.uid,
      invitedByEmail: req.user.email,
      baseUrl
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

// Admin: list invitations.
app.get("/api/invite", requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const invitations = await listInvites();
    res.json({ invitations });
  } catch (error) {
    next(error);
  }
});

// Admin: list all team members with their role.
app.get("/api/team/members", requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const members = await listMembers();
    res.json({ members });
  } catch (error) {
    next(error);
  }
});

// Admin: change a member's role (member <-> admin).
app.patch("/api/team/members/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    // Guard against locking yourself out of admin.
    if (req.params.id === req.user.uid && req.body.role === "member") {
      return res.status(400).json({ message: "You can't remove your own admin access." });
    }
    const member = await setMemberRole(req.params.id, req.body.role);
    res.json({ member });
  } catch (error) {
    next(error);
  }
});

app.get("/api/clients", requireAuth, async (req, res, next) => {
  try {
    const clients = await listUserCollection(req.supabase, "clients");
    res.json({ clients });
  } catch (error) {
    next(error);
  }
});

app.post("/api/clients", requireAuth, async (req, res, next) => {
  try {
    const client = await createUserDoc(req.supabase, req.user.uid, "clients", {
      company: req.body.company || "Untitled client",
      industry: req.body.industry || "",
      platform: req.body.platform || "LiveKit",
      status: req.body.status || "Discovery"
    });
    res.status(201).json({ client });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/clients/:id", requireAuth, async (req, res, next) => {
  try {
    const client = await updateUserDoc(req.supabase, req.user.uid, "clients", req.params.id, req.body);
    res.json({ client });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/clients/:id", requireAuth, async (req, res, next) => {
  try {
    await deleteUserDoc(req.supabase, req.user.uid, "clients", req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.get("/api/tasks", requireAuth, async (req, res, next) => {
  try {
    const tasks = await listUserCollection(req.supabase, "tasks");
    res.json({ tasks });
  } catch (error) {
    next(error);
  }
});

app.post("/api/tasks", requireAuth, async (req, res, next) => {
  try {
    const task = await createUserDoc(req.supabase, req.user.uid, "tasks", {
      title: req.body.title || "Untitled task",
      priority: req.body.priority || "Normal",
      owner: req.body.owner || "AI owns next step",
      status: req.body.status || "Queued"
    });
    res.status(201).json({ task });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/tasks/:id", requireAuth, async (req, res, next) => {
  try {
    const task = await updateUserDoc(req.supabase, req.user.uid, "tasks", req.params.id, req.body);
    res.json({ task });
  } catch (error) {
    next(error);
  }
});

app.post("/api/prompts/generate", requireAuth, async (req, res, next) => {
  try {
    const packageOutput = buildPromptPackage(req.body, "create");
    const promptJob = await createUserDoc(req.supabase, req.user.uid, "promptJobs", {
      type: "new",
      client: req.body.client || "Selected client",
      platform: req.body.platform || "LiveKit",
      llmProvider: req.body.llmProvider || "AI selects provider",
      llmModel: req.body.llmModel || "AI selects best model",
      temperature: req.body.temperature || "0.4",
      maxTokens: req.body.maxTokens || "4000",
      reasoningMode: req.body.reasoningMode || "Balanced",
      skillSelection: req.body.skillSelection || "AI picks skills",
      autonomy: req.body.autonomy || "AI-led",
      sourceBrief: req.body.sourceBrief || "",
      ...packageOutput
    });

    res.status(201).json({ promptJob });
  } catch (error) {
    next(error);
  }
});

app.post("/api/prompts/optimize", requireAuth, async (req, res, next) => {
  try {
    const packageOutput = buildPromptPackage(req.body, "enhance");
    const promptJob = await createUserDoc(req.supabase, req.user.uid, "promptJobs", {
      type: "optimize",
      previousPrompt: req.body.previousPrompt || "",
      clientFeedback: req.body.clientFeedback || "",
      optimizationTarget: req.body.optimizationTarget || "AI selects issues",
      llmProvider: req.body.llmProvider || "AI selects provider",
      llmModel: req.body.llmModel || "AI selects best model",
      temperature: req.body.temperature || "0.4",
      maxTokens: req.body.maxTokens || "4000",
      reasoningMode: req.body.reasoningMode || "Balanced",
      skillSelection: req.body.skillSelection || "AI picks skills",
      autonomy: req.body.autonomy || "AI-led",
      ...packageOutput
    });

    res.status(201).json({ promptJob });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  const message = error.message || "Server error.";
  const status = message.includes("Supabase is not configured") ? 503 : error.status || 500;
  res.status(status).json({ message });
});

app.listen(port, () => {
  console.log(`Backend running on http://localhost:${port}`);
});

function buildPromptPackage(body, mode) {
  const client = body.client || "the selected client";
  const platform = body.platform || "LiveKit";
  const agentType = body.agentType || "voice agent";
  const voiceStyle = body.voiceStyle || "Warm, concise, professional";
  const llmProvider = body.llmProvider || "AI selects provider";
  const llmModel = body.llmModel || "AI selects best model";
  const skillSelection = body.skillSelection || "AI picks skills";
  const autonomy = body.autonomy || "AI-led";
  const sourceBrief = body.sourceBrief || "No discovery brief supplied yet.";
  const previousPrompt = body.previousPrompt || "No previous prompt supplied.";
  const clientFeedback = body.clientFeedback || "No client feedback supplied yet.";
  const optimizationTarget = body.optimizationTarget || "AI selects issues";

  const contextSource = mode === "enhance"
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

# 6. Call Flow
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

  return {
    output,
    qaChecklist: buildQaChecklist(platform),
    testReport: buildTestReport(mode),
    latencyNotes: buildLatencyNotes(platform),
    deploymentPackage: buildDeploymentPackage(platform, llmProvider, llmModel)
  };
}

function buildQaChecklist(platform) {
  return [
    "Role and objective are explicit.",
    "Tone is voice-first and concise.",
    "Guardrails include safety, off-topic, compliance, authority, data protection, and transfer rules.",
    "Call flow has clear success, fallback, and exit paths.",
    `Platform readiness checked for ${platform}.`
  ].join(" ");
}

function buildTestReport(mode) {
  const label = mode === "enhance" ? "optimized prompt" : "new prompt";
  return `Prepared scenario report for ${label}: happy path, missing information, objection, restricted question, angry caller, human transfer, silent caller, and booking confirmation.`;
}

function buildLatencyNotes(platform) {
  return `Latency review queued for ${platform}: check model response time, STT endpointing, TTS voice latency, VAD sensitivity, and interruption handling.`;
}

function buildDeploymentPackage(platform, llmProvider, llmModel) {
  return `Production package ready for ${platform}: system prompt, LLM config (${llmProvider} / ${llmModel}), QA checklist, test report, latency notes, and handoff checklist.`;
}
