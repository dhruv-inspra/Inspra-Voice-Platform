import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "./lib/api";
import { supabase, supabaseConfigured } from "./lib/supabase";
import AuthPage from "./components/AuthPage.jsx";
import AcceptInvite from "./components/AcceptInvite.jsx";
import Setup2FA from "./components/Setup2FA.jsx";
import Verify2FA from "./components/Verify2FA.jsx";

const baseTabs = [
  { id: "clients", label: "Clients" },
  { id: "tasks", label: "Tasks" },
  { id: "optimize", label: "Optimize Prompt" },
  { id: "newPrompt", label: "New Prompt" }
];

function readInviteToken() {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("invite");
}

const platforms = ["LiveKit", "Retell", "Vapi", "Genius"];
const llmProviders = ["AI selects provider", "OpenAI", "Anthropic", "Google", "Groq"];
const llmModels = [
  "AI selects best model",
  "GPT-4.1",
  "GPT-4.1 mini",
  "Claude Sonnet",
  "Gemini 2.5 Pro",
  "Groq low-latency model"
];

export default function App() {
  // stage: loading | signedOut | setup2fa | verify2fa | ready
  const [stage, setStage] = useState("loading");
  const [user, setUser] = useState(null);
  const [inviteToken, setInviteToken] = useState(readInviteToken);
  const resolving = useRef(false);

  const clearInvite = useCallback(() => {
    setInviteToken(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("invite");
    window.history.replaceState({}, "", url);
  }, []);

  // Determine which screen to show based on session + MFA assurance level.
  const resolveStage = useCallback(async () => {
    if (!supabaseConfigured) {
      setUser(null);
      setStage("signedOut");
      return;
    }
    if (resolving.current) return;
    resolving.current = true;

    try {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session?.user) {
        setUser(null);
        setStage("signedOut");
        return;
      }

      setUser(session.user);

      const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalError) {
        // Fail safe: require enrollment rather than silently granting access.
        setStage("setup2fa");
        return;
      }

      if (aal.currentLevel === "aal2") {
        setStage("ready"); // MFA already satisfied this session
        return;
      }

      // Decide setup vs verify by whether a *verified* factor actually exists.
      // (An unverified, mid-enrollment factor flips nextLevel to aal2, so we must
      // not rely on nextLevel here — otherwise setup bounces to verify and the
      // freshly scanned secret becomes invalid, forcing repeated re-scans.)
      const { data: factors, error: factorError } = await supabase.auth.mfa.listFactors();
      const hasVerifiedFactor =
        !factorError && (factors?.totp || []).some((factor) => factor.status === "verified");

      setStage(hasVerifiedFactor ? "verify2fa" : "setup2fa");
    } finally {
      resolving.current = false;
    }
  }, []);

  useEffect(() => {
    if (!supabaseConfigured) {
      setStage("signedOut");
      return undefined;
    }

    let mounted = true;
    resolveStage();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(() => {
      if (mounted) resolveStage();
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [resolveStage]);

  // An invitation link takes priority: let the invitee create their account
  // before any login/MFA gating runs.
  if (inviteToken) {
    return (
      <AcceptInvite
        token={inviteToken}
        onDone={() => {
          clearInvite();
          resolveStage();
        }}
      />
    );
  }

  if (stage === "loading") {
    return <div className="screen-center">Loading...</div>;
  }

  if (stage === "signedOut") {
    return <AuthPage />;
  }

  if (stage === "setup2fa") {
    return <Setup2FA user={user} onComplete={resolveStage} />;
  }

  if (stage === "verify2fa") {
    return <Verify2FA user={user} onComplete={resolveStage} />;
  }

  return <PlatformApp user={user} />;
}

function PlatformApp({ user }) {
  const [activeTab, setActiveTab] = useState("clients");
  const [clients, setClients] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [promptOutput, setPromptOutput] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  async function getToken() {
    const {
      data: { session },
      error
    } = await supabase.auth.getSession();

    if (error || !session?.access_token) {
      throw new Error("You are not signed in.");
    }

    return session.access_token;
  }

  async function loadData() {
    setStatus("");
    try {
      const token = await getToken();
      const [clientData, taskData] = await Promise.all([
        apiRequest("/api/clients", token),
        apiRequest("/api/tasks", token)
      ]);
      setClients(clientData.clients || []);
      setTasks(taskData.tasks || []);
    } catch (error) {
      setStatus(error.message);
    }
  }

  useEffect(() => {
    loadData();
    (async () => {
      try {
        const token = await getToken();
        const me = await apiRequest("/api/me", token);
        setIsAdmin(Boolean(me.user?.isAdmin));
      } catch {
        setIsAdmin(false);
      }
    })();
  }, []);

  const tabs = useMemo(() => [...baseTabs, { id: "profile", label: "Profile" }], []);

  const currentTitle = useMemo(
    () => tabs.find((tab) => tab.id === activeTab)?.label || "Clients",
    [tabs, activeTab]
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-row">
          <div className="mark">V</div>
          <div>
            <strong>Voice Agent OS</strong>
            <span>{user.user_metadata?.name || user.user_metadata?.full_name || user.email}</span>
          </div>
        </div>

        <nav className="side-nav">
          {tabs.map((tab, index) => (
            <button
              key={tab.id}
              className={activeTab === tab.id ? "active" : ""}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
              <span>{String(index + 1).padStart(2, "0")}</span>
            </button>
          ))}
        </nav>

        <button className="ghost" onClick={() => supabase.auth.signOut()}>Log out</button>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <h1>{currentTitle}</h1>
            <p>Build, optimize, and manage production-ready voice agent prompts.</p>
          </div>
          <button onClick={loadData}>Refresh</button>
        </header>

        {status && <div className="notice">{status}</div>}

        {activeTab === "clients" && (
          <ClientsPage clients={clients} setClients={setClients} getToken={getToken} setStatus={setStatus} />
        )}
        {activeTab === "tasks" && (
          <TasksPage tasks={tasks} setTasks={setTasks} getToken={getToken} setStatus={setStatus} />
        )}
        {activeTab === "optimize" && (
          <OptimizePage busy={busy} setBusy={setBusy} getToken={getToken} setStatus={setStatus} setPromptOutput={setPromptOutput} promptOutput={promptOutput} />
        )}
        {activeTab === "newPrompt" && (
          <NewPromptPage busy={busy} setBusy={setBusy} getToken={getToken} setStatus={setStatus} setPromptOutput={setPromptOutput} promptOutput={promptOutput} />
        )}
        {activeTab === "profile" && (
          <ProfilePage user={user} isAdmin={isAdmin} getToken={getToken} setStatus={setStatus} />
        )}
      </main>
    </div>
  );
}

function ProfilePage({ user, isAdmin, getToken, setStatus }) {
  const [name, setName] = useState(
    user.user_metadata?.name || user.user_metadata?.full_name || ""
  );
  const [savingName, setSavingName] = useState(false);
  const [profileMsg, setProfileMsg] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState("");

  const role = isAdmin ? "admin" : user.user_metadata?.role || "member";

  async function saveName(event) {
    event.preventDefault();
    setSavingName(true);
    setProfileMsg("");
    try {
      const { error } = await supabase.auth.updateUser({
        data: { name: name.trim(), full_name: name.trim() }
      });
      if (error) throw error;
      setProfileMsg("Profile updated.");
    } catch (error) {
      setProfileMsg(error.message || "Could not update profile.");
    } finally {
      setSavingName(false);
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    setPwMsg("");
    if (newPassword.length < 8) {
      setPwMsg("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwMsg("Passwords don't match.");
      return;
    }
    setSavingPw(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword("");
      setConfirmPassword("");
      setPwMsg("Password changed.");
    } catch (error) {
      setPwMsg(error.message || "Could not change password.");
    } finally {
      setSavingPw(false);
    }
  }

  return (
    <div className="profile-stack">
      <section className="view-grid">
        <Panel title="Profile information">
          <form className="form-stack" onSubmit={saveName}>
            <label>
              Email
              <input value={user.email} disabled />
            </label>
            <label>
              Full name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your name"
              />
            </label>
            <label>
              Role
              <input value={role} disabled style={{ textTransform: "capitalize" }} />
            </label>
            {profileMsg && <div className="notice">{profileMsg}</div>}
            <button className="primary" disabled={savingName}>
              {savingName ? "Saving…" : "Save changes"}
            </button>
          </form>
        </Panel>

        <Panel title="Security">
          <div className="list">
            <div className="list-item">
              <strong>Two-factor authentication</strong>
              <p>Enabled — required for every account.</p>
            </div>
          </div>
          <form className="form-stack" onSubmit={changePassword}>
            <label>
              New password
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="At least 8 characters"
                minLength={8}
              />
            </label>
            <label>
              Confirm password
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={8}
              />
            </label>
            {pwMsg && <div className="notice">{pwMsg}</div>}
            <button className="primary" disabled={savingPw}>
              {savingPw ? "Updating…" : "Change password"}
            </button>
          </form>
        </Panel>
      </section>

      <TeamPage
        isAdmin={isAdmin}
        getToken={getToken}
        setStatus={setStatus}
        currentUserId={user.id}
      />
    </div>
  );
}

function TeamPage({ isAdmin, getToken, setStatus, currentUserId }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [invites, setInvites] = useState([]);
  const [result, setResult] = useState(null); // { email, url, emailSent }
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function loadInvites() {
    try {
      const token = await getToken();
      const data = await apiRequest("/api/invite", token);
      setInvites(data.invitations || []);
    } catch (error) {
      setStatus(error.message);
    }
  }

  useEffect(() => {
    if (isAdmin) loadInvites();
  }, [isAdmin]);

  // Non-admins still see the section, but it's clearly gated.
  if (!isAdmin) {
    return (
      <section className="view-grid">
        <Panel title="Team members">
          <div className="empty">
            Inviting teammates is available to admins. Ask an admin to invite you, or have your
            email added to <code>ADMIN_EMAILS</code> on the server.
          </div>
        </Panel>
      </section>
    );
  }

  async function sendInvite(event) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    setResult(null);
    setCopied(false);
    try {
      const token = await getToken();
      const data = await apiRequest("/api/invite", token, {
        method: "POST",
        body: JSON.stringify({ email, role })
      });
      setResult({
        email,
        url: data.inviteUrl || "",
        emailSent: Boolean(data.emailSent),
        emailError: data.emailError || ""
      });
      setEmail("");
      setRole("member");
      loadInvites();
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(result?.url || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  }

  function inviteStatus(invite) {
    if (invite.accepted_at) return "Accepted";
    if (new Date(invite.expires_at) < new Date()) return "Expired";
    return "Pending";
  }

  return (
    <div className="profile-stack">
    <section className="view-grid">
      <Panel title="Invite team member">
        <form className="form-stack" onSubmit={sendInvite}>
          <label>
            Email address
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="colleague@yourcompany.com"
              required
            />
          </label>
          <label>
            Role
            <select value={role} onChange={(event) => setRole(event.target.value)}>
              <option value="member">Member</option>
              <option value="admin">Administrator</option>
            </select>
          </label>
          <p className="field-hint">Admins can invite and manage team members.</p>
          <button className="primary" disabled={busy}>
            {busy ? "Sending invitation…" : "Send invitation"}
          </button>
        </form>

        {result && (
          <div className="notice" style={{ marginTop: 14 }}>
            {result.emailSent ? (
              <>
                <strong>Invitation emailed to {result.email}.</strong> They'll get a link to set up
                their account. You can also share this link directly:
              </>
            ) : (
              <>
                <strong>Invite created for {result.email}.</strong>{" "}
                {result.emailError
                  ? `Email not sent — ${result.emailError}`
                  : "Email isn't configured."}{" "}
                Share this link with them instead:
              </>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <input readOnly value={result.url} onFocus={(e) => e.target.select()} />
              <button type="button" onClick={copyUrl}>
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        )}
      </Panel>

      <Panel title="Invitations">
        <List
          items={invites}
          empty="No invitations yet."
          render={(invite) => (
            <>
              <strong>{invite.email}</strong>
              <p>
                {invite.role} · {inviteStatus(invite)}
              </p>
            </>
          )}
        />
      </Panel>
    </section>

      <TeamMembersPanel
        getToken={getToken}
        setStatus={setStatus}
        currentUserId={currentUserId}
      />
    </div>
  );
}

function TeamMembersPanel({ getToken, setStatus, currentUserId }) {
  const [members, setMembers] = useState([]);
  const [savingId, setSavingId] = useState("");

  async function loadMembers() {
    try {
      const token = await getToken();
      const data = await apiRequest("/api/team/members", token);
      setMembers(data.members || []);
    } catch (error) {
      setStatus(error.message);
    }
  }

  useEffect(() => {
    loadMembers();
  }, []);

  async function changeRole(id, nextRole) {
    setSavingId(id);
    setStatus("");
    try {
      const token = await getToken();
      await apiRequest(`/api/team/members/${id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ role: nextRole })
      });
      await loadMembers();
    } catch (error) {
      setStatus(error.message);
    } finally {
      setSavingId("");
    }
  }

  return (
    <section className="view-grid">
      <Panel title="Team members">
        <p className="field-hint" style={{ marginTop: 0, marginBottom: 12 }}>
          Set who has admin access. Admins can invite and manage the team.
        </p>
        <div className="list">
          {members.length === 0 && <div className="empty">No members yet.</div>}
          {members.map((member) => {
            const isSelf = member.id === currentUserId;
            return (
              <div className="list-item member-row" key={member.id}>
                <div>
                  <strong>
                    {member.name || member.email}
                    {isSelf ? " (you)" : ""}
                  </strong>
                  <p>
                    {member.email} · {member.role}
                  </p>
                </div>
                <select
                  className="role-select"
                  value={member.role}
                  disabled={isSelf || savingId === member.id}
                  onChange={(event) => changeRole(member.id, event.target.value)}
                  title={isSelf ? "You can't change your own role" : "Change role"}
                >
                  <option value="member">Member</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>
            );
          })}
        </div>
      </Panel>
    </section>
  );
}

function ClientsPage({ clients, setClients, getToken, setStatus }) {
  const [form, setForm] = useState({ company: "", industry: "", platform: "LiveKit", status: "Discovery" });

  async function createClient(event) {
    event.preventDefault();
    setStatus("");
    try {
      const token = await getToken();
      const data = await apiRequest("/api/clients", token, {
        method: "POST",
        body: JSON.stringify(form)
      });
      setClients((items) => [data.client, ...items]);
      setForm({ company: "", industry: "", platform: "LiveKit", status: "Discovery" });
    } catch (error) {
      setStatus(error.message);
    }
  }

  return (
    <section className="view-grid">
      <Panel title="Create client">
        <form className="form-grid" onSubmit={createClient}>
          <TextInput label="Company" value={form.company} onChange={(company) => setForm({ ...form, company })} required />
          <TextInput label="Industry" value={form.industry} onChange={(industry) => setForm({ ...form, industry })} />
          <SelectInput label="Platform" value={form.platform} options={platforms} onChange={(platform) => setForm({ ...form, platform })} />
          <SelectInput label="Status" value={form.status} options={["Discovery", "Prompt build", "Testing", "Production"]} onChange={(status) => setForm({ ...form, status })} />
          <button className="primary wide">Add Client</button>
        </form>
      </Panel>
      <Panel title="Client workspace">
        <List
          items={clients}
          empty="No clients yet."
          render={(client) => (
            <>
              <strong>{client.company}</strong>
              <p>{client.industry || "No industry"} - {client.platform} - {client.status}</p>
            </>
          )}
        />
      </Panel>
    </section>
  );
}

function TasksPage({ tasks, setTasks, getToken, setStatus }) {
  const [form, setForm] = useState({ title: "", priority: "Normal", owner: "AI owns next step", status: "Queued" });

  async function createTask(event) {
    event.preventDefault();
    setStatus("");
    try {
      const token = await getToken();
      const data = await apiRequest("/api/tasks", token, {
        method: "POST",
        body: JSON.stringify(form)
      });
      setTasks((items) => [data.task, ...items]);
      setForm({ title: "", priority: "Normal", owner: "AI owns next step", status: "Queued" });
    } catch (error) {
      setStatus(error.message);
    }
  }

  return (
    <section className="view-grid">
      <Panel title="Create task">
        <form className="form-grid" onSubmit={createTask}>
          <TextInput label="Task" value={form.title} onChange={(title) => setForm({ ...form, title })} required />
          <SelectInput label="Priority" value={form.priority} options={["Blocking", "High", "Normal", "Backlog"]} onChange={(priority) => setForm({ ...form, priority })} />
          <SelectInput label="Owner" value={form.owner} options={["AI owns next step", "User approval needed", "Manual task"]} onChange={(owner) => setForm({ ...form, owner })} />
          <SelectInput label="Status" value={form.status} options={["Queued", "Needed", "Ready", "Done"]} onChange={(status) => setForm({ ...form, status })} />
          <button className="primary wide">Add Task</button>
        </form>
      </Panel>
      <Panel title="Task list">
        <List
          items={tasks}
          empty="No tasks yet."
          render={(task) => (
            <>
              <strong>{task.title}</strong>
              <p>{task.priority} - {task.owner} - {task.status}</p>
            </>
          )}
        />
      </Panel>
    </section>
  );
}

function OptimizePage({ busy, setBusy, getToken, setStatus, promptOutput, setPromptOutput }) {
  const [form, setForm] = useState({
    previousPrompt: "",
    clientFeedback: "",
    optimizationTarget: "AI selects issues",
    llmProvider: "AI selects provider",
    llmModel: "AI selects best model",
    skillSelection: "AI picks skills",
    autonomy: "AI-led"
  });

  async function optimizePrompt(event) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      const token = await getToken();
      const data = await apiRequest("/api/prompts/optimize", token, {
        method: "POST",
        body: JSON.stringify(form)
      });
      setPromptOutput(data.promptJob);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="view-grid">
      <Panel title="Optimize prompt">
        <form className="form-stack" onSubmit={optimizePrompt}>
          <BrainPanel form={form} setForm={setForm} />
          <label>
            Previous prompt
            <textarea value={form.previousPrompt} onChange={(event) => setForm({ ...form, previousPrompt: event.target.value })} />
          </label>
          <label>
            Client feedback
            <textarea value={form.clientFeedback} onChange={(event) => setForm({ ...form, clientFeedback: event.target.value })} placeholder="Paste client comments, call notes, objections, complaints, approval notes, or QA feedback here." />
          </label>
          <SelectInput label="Optimization target" value={form.optimizationTarget} options={["AI selects issues", "Shorter voice responses", "Better call flow", "Stronger guardrails", "Lower latency"]} onChange={(optimizationTarget) => setForm({ ...form, optimizationTarget })} />
          <SelectInput label="Skill Selection" value={form.skillSelection} options={["AI picks skills", "I pick skills", "Ask before using each skill"]} onChange={(skillSelection) => setForm({ ...form, skillSelection })} />
          <button className="primary">{busy ? "Optimizing..." : "Optimize Prompt"}</button>
        </form>
      </Panel>
      <PromptOutput job={promptOutput} />
      <PromptLifecyclePanel job={promptOutput} />
    </section>
  );
}

function NewPromptPage({ busy, setBusy, getToken, setStatus, promptOutput, setPromptOutput }) {
  const [form, setForm] = useState({
    client: "",
    agentType: "Inbound receptionist",
    industry: "",
    voiceStyle: "Warm, concise, professional",
    llmProvider: "AI selects provider",
    llmModel: "AI selects best model",
    temperature: "0.4",
    maxTokens: "4000",
    reasoningMode: "Balanced",
    skillSelection: "AI picks skills",
    autonomy: "AI-led",
    platform: "LiveKit",
    sourceBrief: ""
  });

  async function generatePrompt(event) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      const token = await getToken();
      const data = await apiRequest("/api/prompts/generate", token, {
        method: "POST",
        body: JSON.stringify(form)
      });
      setPromptOutput(data.promptJob);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="view-grid">
      <Panel title="Generate prompt">
        <form className="form-grid" onSubmit={generatePrompt}>
          <div className="wide">
            <BrainPanel form={form} setForm={setForm} />
          </div>
          <TextInput label="Client" value={form.client} onChange={(client) => setForm({ ...form, client })} required />
          <SelectInput label="Agent Type" value={form.agentType} options={["Inbound receptionist", "Outbound sales", "Appointment booking", "FAQ handler"]} onChange={(agentType) => setForm({ ...form, agentType })} />
          <TextInput label="Industry" value={form.industry} onChange={(industry) => setForm({ ...form, industry })} />
          <SelectInput label="Platform" value={form.platform} options={platforms} onChange={(platform) => setForm({ ...form, platform })} />
          <SelectInput label="Skill Selection" value={form.skillSelection} options={["AI picks skills", "I pick skills", "Ask before using each skill"]} onChange={(skillSelection) => setForm({ ...form, skillSelection })} />
          <SelectInput label="Autonomy" value={form.autonomy} options={["AI-led", "Approval-led", "Manual"]} onChange={(autonomy) => setForm({ ...form, autonomy })} />
          <label className="wide">
            Discovery transcript / brief
            <textarea value={form.sourceBrief} onChange={(event) => setForm({ ...form, sourceBrief: event.target.value })} />
          </label>
          <button className="primary wide">{busy ? "Generating..." : "Generate Prompt"}</button>
        </form>
      </Panel>
      <PromptOutput job={promptOutput} />
      <PromptLifecyclePanel job={promptOutput} />
    </section>
  );
}

function BrainPanel({ form, setForm }) {
  return (
    <section className="brain-panel">
      <div>
        <h2>System brain</h2>
        <p>Model routing follows the Inspra Voice System: LLM selection, skill routing, validation, testing, and production packaging.</p>
      </div>
      <div className="brain-grid">
        <SelectInput label="LLM Provider" value={form.llmProvider} options={llmProviders} onChange={(llmProvider) => setForm({ ...form, llmProvider })} />
        <SelectInput label="LLM Model" value={form.llmModel} options={llmModels} onChange={(llmModel) => setForm({ ...form, llmModel })} />
        <TextInput label="Temperature" value={form.temperature || "0.4"} onChange={(temperature) => setForm({ ...form, temperature })} />
        <TextInput label="Max Tokens" value={form.maxTokens || "4000"} onChange={(maxTokens) => setForm({ ...form, maxTokens })} />
        <SelectInput label="Reasoning" value={form.reasoningMode || "Balanced"} options={["Fast", "Balanced", "Deep"]} onChange={(reasoningMode) => setForm({ ...form, reasoningMode })} />
        <SelectInput label="Autonomy" value={form.autonomy || "AI-led"} options={["AI-led", "Approval-led", "Manual"]} onChange={(autonomy) => setForm({ ...form, autonomy })} />
      </div>
    </section>
  );
}

function Panel({ title, children }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function PromptOutput({ job }) {
  const output = typeof job === "string" ? job : job?.output;
  return (
    <Panel title="Prompt output">
      <pre className="prompt-output">{output || "Generated or optimized prompt output will appear here."}</pre>
    </Panel>
  );
}

function PromptLifecyclePanel({ job }) {
  const hasPrompt = Boolean(typeof job === "string" ? job : job?.output);
  const testReport = typeof job === "object" ? job?.testReport : "";
  const deploymentPackage = typeof job === "object" ? job?.deploymentPackage : "";

  return (
    <section className="lifecycle-panel">
      <Panel title="Testing">
        <div className="list">
          <div className="list-item"><strong>QA checklist</strong><p>Role, tone, guardrails, transfer paths, data protection, and call-flow accuracy.</p></div>
          <div className="list-item"><strong>Scenario tests</strong><p>{testReport || "Generate or optimize a prompt to prepare the test report."}</p></div>
          <button disabled={!hasPrompt}>Run Tests</button>
        </div>
      </Panel>
      <Panel title="Push to production">
        <div className="list">
          <div className="list-item"><strong>Production package</strong><p>{deploymentPackage || "Prompt, model config, platform notes, QA checklist, and deployment handoff will appear here."}</p></div>
          <button className="primary" disabled={!hasPrompt}>Push to Production</button>
        </div>
      </Panel>
    </section>
  );
}

function List({ items, empty, render }) {
  if (!items.length) {
    return <div className="empty">{empty}</div>;
  }

  return (
    <div className="list">
      {items.map((item) => (
        <div className="list-item" key={item.id}>
          {render(item)}
        </div>
      ))}
    </div>
  );
}

function TextInput({ label, value, onChange, required }) {
  return (
    <label>
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} required={required} />
    </label>
  );
}

function SelectInput({ label, value, options, onChange }) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

