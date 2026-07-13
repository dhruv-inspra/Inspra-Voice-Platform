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
import { buildPromptPackageWithOpenRouter, classifyWorkItem } from "./promptPackage.js";

const app = express();
const port = process.env.PORT || 5000;

function normaliseOpenRouterModel(value) {
  return value && String(value).toLowerCase().includes("/") ? value : "OpenRouter auto model";
}

function normalisePlatform(value) {
  const allowed = new Set(["Elk", "Retell", "Vapi"]);
  return allowed.has(value) ? value : "Elk";
}

app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173", credentials: true }));
app.use(express.json({ limit: "15mb" }));
app.use(morgan("dev"));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    supabaseReady: isSupabaseReady(),
    adminReady: isAdminConfigured(),
    emailReady: isEmailConfigured(),
    openRouterReady: Boolean(process.env.OPENROUTER_API_KEY?.trim()),
    obsidianFlowReady: Boolean(process.env.OBSIDIAN_VAULT_PATH || process.env.OBSIDIAN_NOTES_PATH)
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
      platform: normalisePlatform(req.body.platform),
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
    const triage = classifyWorkItem(`${req.body.title || ""} ${req.body.source || ""}`);
    const task = await createUserDoc(req.supabase, req.user.uid, "tasks", {
      title: req.body.title || "Untitled task",
      priority: req.body.priority || "Normal",
      owner: req.body.owner || "AI owns next step",
      status: req.body.status || "Queued",
      source: req.body.source || "Manual",
      stakeholder: req.body.stakeholder || "",
      severity: req.body.severity || req.body.priority || "Normal",
      bucket: req.body.bucket || triage.bucket,
      safeToFix: req.body.safeToFix ?? triage.safeToFix,
      approvalRequired: req.body.approvalRequired ?? triage.approvalRequired,
      evidence: req.body.evidence || "",
      proposedFix: req.body.proposedFix || "",
      appliedFix: req.body.appliedFix || "",
      verificationResult: req.body.verificationResult || "",
      rollbackDetails: req.body.rollbackDetails || ""
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

app.get("/api/prompt-jobs", requireAuth, async (req, res, next) => {
  try {
    const promptJobs = await listUserCollection(req.supabase, "promptJobs");
    res.json({ promptJobs });
  } catch (error) {
    next(error);
  }
});

app.post("/api/agent-prompts", requireAuth, async (req, res, next) => {
  try {
    const prompt = String(req.body.prompt || "").trim();
    if (!prompt) {
      return res.status(400).json({ message: "Prompt is required." });
    }

    const promptJob = await createUserDoc(req.supabase, req.user.uid, "promptJobs", {
      type: "manual-agent-prompt",
      client: req.body.client || "Selected client",
      platform: normalisePlatform(req.body.platform),
      llmProvider: "Manual",
      llmModel: "Manual prompt",
      output: prompt,
      sourceBrief: "Manual agent prompt version"
    });

    res.status(201).json({ promptJob });
  } catch (error) {
    next(error);
  }
});

app.post("/api/prompts/generate", requireAuth, async (req, res, next) => {
  try {
    const packageOutput = await buildPromptPackageWithOpenRouter(req.body, "create");
    const promptJob = await createUserDoc(req.supabase, req.user.uid, "promptJobs", {
      type: "new",
      client: req.body.client || "Selected client",
      platform: normalisePlatform(req.body.platform),
      llmProvider: "OpenRouter",
      llmModel: normaliseOpenRouterModel(req.body.llmModel),
      temperature: req.body.temperature || "0.4",
      maxTokens: req.body.maxTokens || "4000",
      reasoningMode: req.body.reasoningMode || "Balanced",
      skillSelection: req.body.skillSelection || "AI picks skills",
      autonomy: req.body.autonomy || "AI-led",
      sourceBrief: req.body.sourceBrief || "",
      ...packageOutput
    });

    res.status(201).json({ promptJob: { ...promptJob, ...packageOutput } });
  } catch (error) {
    next(error);
  }
});

app.post("/api/prompts/optimize", requireAuth, async (req, res, next) => {
  try {
    const packageOutput = await buildPromptPackageWithOpenRouter(req.body, "enhance");
    const promptJob = await createUserDoc(req.supabase, req.user.uid, "promptJobs", {
      type: "optimize",
      client: req.body.client || "Selected client",
      previousPrompt: req.body.previousPrompt || "",
      clientFeedback: req.body.clientFeedback || "",
      optimizationTarget: req.body.optimizationTarget || "AI selects issues",
      llmProvider: "OpenRouter",
      llmModel: normaliseOpenRouterModel(req.body.llmModel),
      temperature: req.body.temperature || "0.4",
      maxTokens: req.body.maxTokens || "4000",
      reasoningMode: req.body.reasoningMode || "Balanced",
      skillSelection: req.body.skillSelection || "AI picks skills",
      autonomy: req.body.autonomy || "AI-led",
      ...packageOutput
    });

    res.status(201).json({ promptJob: { ...promptJob, ...packageOutput } });
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
