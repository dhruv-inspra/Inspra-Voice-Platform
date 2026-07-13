import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "./lib/api";
import { supabase, supabaseConfigured } from "./lib/supabase";
import AuthPage from "./components/AuthPage.jsx";
import AcceptInvite from "./components/AcceptInvite.jsx";
import Setup2FA from "./components/Setup2FA.jsx";
import Verify2FA from "./components/Verify2FA.jsx";

const baseTabs = [
  { id: "agents", label: "Agent" },
  { id: "buildStudio", label: "Build Studio" },
  { id: "docs", label: "Docs" },
  { id: "elkBuilder", label: "Elk Builder" }
];

function readInviteToken() {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("invite");
}

const platforms = ["Elk", "Retell", "Vapi"];
const agentTypes = ["Inbound", "Outbound"];
const llmProviders = ["OpenRouter"];
const llmModels = [
  "OpenRouter auto model",
  "openai/gpt-4.1-mini",
  "anthropic/claude-sonnet-4",
  "google/gemini-2.5-flash",
  "meta-llama/llama-3.3-70b-instruct"
];

function getInitialTheme() {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem("inspra-theme");
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getInitialLayout() {
  if (typeof window === "undefined") return "overview";
  const stored = window.localStorage.getItem("inspra-layout");
  return stored === "compact" ? "compact" : "overview";
}

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

function CommandCenter({ clients, tasks, promptOutput, setActiveTab }) {
  const approvalItems = tasks.filter((task) => task.approvalRequired).length;
  const activeClients = clients.filter((client) => client.status !== "Retired / Paused").length;
  const hasPackage = Boolean(promptOutput?.output || promptOutput?.agentPrompt);

  return (
    <div className="ops-stack">
      <section className="dashboard-hero">
        <div>
          <span className="eyebrow">Overview</span>
          <h2>Workspaces, agent prompts, and delivery status in one place.</h2>
          <p>
            Manage each workspace separately while keeping the global view clear and current.
          </p>
        </div>
        <div className="dashboard-signal" aria-hidden="true">
          {[42, 68, 34, 80, 52, 74, 46, 62, 38, 70, 48, 58].map((height, index) => (
            <span key={index} style={{ "--h": `${height}%` }} />
          ))}
        </div>
      </section>

      <section className="metric-grid">
        <Metric label="Active workspaces" value={activeClients} detail="Open client or project spaces" />
        <Metric label="Open items" value={tasks.length} detail={`${approvalItems} waiting for review`} />
        <Metric label="Prompt package" value={hasPackage ? "Ready" : "Draft"} detail="Latest generated package status" />
        <Metric label="Release status" value={hasPackage ? "Prepared" : "Not started"} detail="Ready once content is reviewed" />
      </section>

      <section className="operating-map">
        {[
          ["Create", "Set up a workspace for each client or project"],
          ["Draft", "Prepare agent prompts, docs, and supporting notes"],
          ["Review", "Check content, tone, edge cases, and handoff details"],
          ["Approve", "Mark the package ready for production use"],
          ["Maintain", "Keep prompt versions and workspace details current"]
        ].map(([title, copy], index) => (
          <div className="map-step" key={title}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{title}</strong>
            <p>{copy}</p>
          </div>
        ))}
      </section>

      <section className="view-grid">
        <Panel title="Quick actions">
          <div className="action-list">
            <button onClick={() => setActiveTab("buildStudio")}>Create package</button>
            <button onClick={() => setActiveTab("docs")}>Prepare docs</button>
            <button onClick={() => setActiveTab("elkBuilder")}>Revise prompt</button>
          </div>
        </Panel>
        <Panel title="Workspace standards">
          <List
            items={[
              { id: "separate", title: "Separate workspaces", body: "Each client or project has its own prompt versions and delivery work." },
              { id: "review", title: "Review before release", body: "Prompts and documents should be checked before they are used live." },
              { id: "versions", title: "Versioned prompts", body: "Keep previous prompt versions available for comparison and rollback." }
            ]}
            empty="No standards configured."
            render={(item) => (
              <>
                <strong>{item.title}</strong>
                <p>{item.body}</p>
              </>
            )}
          />
        </Panel>
      </section>
    </div>
  );
}

function Metric({ label, value, detail }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  );
}

function PlatformApp({ user }) {
  const [activeTab, setActiveTab] = useState("workspace");
  const [theme, setTheme] = useState(getInitialTheme);
  const [layoutMode, setLayoutMode] = useState(getInitialLayout);
  const [clients, setClients] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [promptJobs, setPromptJobs] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [buildOutput, setBuildOutput] = useState("");
  const [docsOutput, setDocsOutput] = useState("");
  const [elkOutput, setElkOutput] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("inspra-theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.layout = layoutMode;
    window.localStorage.setItem("inspra-layout", layoutMode);
  }, [layoutMode]);

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
      const [clientData, taskData, promptJobData] = await Promise.all([
        apiRequest("/api/clients", token),
        apiRequest("/api/tasks", token),
        apiRequest("/api/prompt-jobs", token)
      ]);
      const nextClients = clientData.clients || [];
      setClients(nextClients);
      setTasks(taskData.tasks || []);
      setPromptJobs(promptJobData.promptJobs || []);
      setSelectedClientId((current) =>
        current && nextClients.some((client) => client.id === current) ? current : ""
      );
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

  const defaultWorkspace = useMemo(
    () => ({
      id: "default",
      company: "Default workspace",
      industry: "General operations",
      platform: "Elk",
      status: "Draft"
    }),
    []
  );

  const realSelectedClient = useMemo(
    () => clients.find((client) => client.id === selectedClientId) || null,
    [clients, selectedClientId]
  );

  const selectedClient = useMemo(
    () => realSelectedClient || defaultWorkspace,
    [defaultWorkspace, realSelectedClient]
  );

  const isDefaultWorkspace = !realSelectedClient;
  const activeClientId = realSelectedClient?.id || "default";

  const tabs = useMemo(
    () =>
      isDefaultWorkspace
        ? [
            { id: "command", label: "Dashboard" },
            { id: "workspace", label: "Workspaces" },
            { id: "buildStudio", label: "Build Studio" },
            { id: "docs", label: "Docs" },
            { id: "elkBuilder", label: "Elk Builder" },
            { id: "profile", label: "Profile" }
          ]
        : [...baseTabs, { id: "profile", label: "Profile" }],
    [isDefaultWorkspace]
  );

  useEffect(() => {
    if (!tabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(tabs[0]?.id || "workspace");
    }
  }, [activeTab, tabs]);

  const pageMeta = useMemo(
    () => ({
      command: `${selectedClient.company} workspace activity and delivery status.`,
      workspace: "Create, edit, delete, and open workspaces.",
      agents: `${selectedClient.company} prompt editor and version history.`,
      buildStudio: `Create a complete delivery package for ${selectedClient.company}.`,
      docs: `Prepare client-ready documentation for ${selectedClient.company}.`,
      elkBuilder: `Review and refine the active prompt for ${selectedClient.company}.`,
      profile: "Manage account security and team access."
    }),
    [selectedClient.company]
  );

  const currentTitle = useMemo(
    () => tabs.find((tab) => tab.id === activeTab)?.label || tabs[0]?.label || "Workspaces",
    [tabs, activeTab]
  );

  return (
    <div className={`app-shell layout-${layoutMode}`}>
      <aside className="sidebar">
        <div className="brand-row">
          <div className="mark">I</div>
          <div>
            <strong>INSPRA</strong>
            <span>{user.user_metadata?.name || user.user_metadata?.full_name || user.email}</span>
          </div>
        </div>

        <nav className="side-nav">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={activeTab === tab.id ? "active" : ""}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <label className="workspace-switcher">
            Workspace
            <select
              value={activeClientId}
              onChange={(event) => {
                setSelectedClientId(event.target.value === "default" ? "" : event.target.value);
                setActiveTab(event.target.value === "default" ? "command" : "agents");
              }}
            >
              <option value="default">Default workspace</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>{client.company}</option>
              ))}
            </select>
          </label>

          <button className="ghost" onClick={() => supabase.auth.signOut()}>Log out</button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <h1>{currentTitle}</h1>
            <p>{pageMeta[activeTab]}</p>
          </div>
          <div className="topbar-actions">
            <button
              onClick={() => {
                setSelectedClientId("");
                setActiveTab("workspace");
              }}
            >
              Create workspace
            </button>
            <button
              className="icon-button"
              type="button"
              onClick={() => setLayoutMode((current) => (current === "compact" ? "overview" : "compact"))}
              aria-label={`Switch to ${layoutMode === "compact" ? "overview" : "compact"} layout`}
              title={`Switch to ${layoutMode === "compact" ? "overview" : "compact"} layout`}
            >
              {layoutMode === "compact" ? "□" : "▦"}
            </button>
            <button
              className="icon-button"
              type="button"
              onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? "☀" : "☾"}
            </button>
          </div>
        </header>

        {status && <div className="notice">{status}</div>}

        {isDefaultWorkspace && activeTab === "command" && (
          <CommandCenter
            clients={clients}
            tasks={tasks}
            promptOutput={buildOutput || docsOutput || elkOutput}
            setActiveTab={setActiveTab}
          />
        )}
        {isDefaultWorkspace && activeTab === "workspace" && (
          <ClientWorkspacePage
            clients={clients}
            setClients={setClients}
            selectedClientId={selectedClientId}
            setSelectedClientId={setSelectedClientId}
            getToken={getToken}
            setStatus={setStatus}
            setActiveTab={setActiveTab}
          />
        )}
        {!isDefaultWorkspace && activeTab === "agents" && (
          <AgentPromptPage
            selectedClient={selectedClient}
            promptJobs={promptJobs}
            setPromptJobs={setPromptJobs}
            getToken={getToken}
            setStatus={setStatus}
            setActiveTab={setActiveTab}
          />
        )}
        {activeTab === "buildStudio" && (
          <NewPromptPage selectedClient={selectedClient} busy={busy} setBusy={setBusy} getToken={getToken} setStatus={setStatus} setPromptOutput={setBuildOutput} promptOutput={buildOutput} />
        )}
        {activeTab === "docs" && (
          <DocsPage selectedClient={selectedClient} busy={busy} setBusy={setBusy} getToken={getToken} setStatus={setStatus} setPromptOutput={setDocsOutput} promptOutput={docsOutput} />
        )}
        {activeTab === "elkBuilder" && (
          <OptimizePage selectedClient={selectedClient} busy={busy} setBusy={setBusy} getToken={getToken} setStatus={setStatus} setPromptOutput={setElkOutput} promptOutput={elkOutput} />
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

function ClientWorkspacePage({
  clients,
  setClients,
  selectedClientId,
  setSelectedClientId,
  getToken,
  setStatus,
  setActiveTab
}) {
  const [form, setForm] = useState({ company: "", industry: "", platform: "Elk", status: "Discovery" });
  const [creating, setCreating] = useState(false);
  const [createdMessage, setCreatedMessage] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editForm, setEditForm] = useState({ company: "", industry: "", platform: "Elk", status: "Discovery" });
  const [savingId, setSavingId] = useState("");
  const [deletingId, setDeletingId] = useState("");

  async function createClient(event) {
    event.preventDefault();
    setStatus("");
    setCreatedMessage("");
    setCreating(true);
    try {
      const token = await getToken();
      const data = await apiRequest("/api/clients", token, {
        method: "POST",
        body: JSON.stringify(form)
      });
      setClients((items) => [data.client, ...items]);
      setSelectedClientId(data.client.id);
      setActiveTab("agents");
      setForm({ company: "", industry: "", platform: "Elk", status: "Discovery" });
      setCreatedMessage(`${data.client.company} workspace created.`);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setCreating(false);
    }
  }

  function startEdit(client) {
    setEditingId(client.id);
    setEditForm({
      company: client.company || "",
      industry: client.industry || "",
      platform: client.platform || "Elk",
      status: client.status || "Discovery"
    });
  }

  async function saveWorkspace(event) {
    event.preventDefault();
    setStatus("");
    setCreatedMessage("");
    setSavingId(editingId);
    try {
      const token = await getToken();
      const data = await apiRequest(`/api/clients/${editingId}`, token, {
        method: "PATCH",
        body: JSON.stringify(editForm)
      });
      setClients((items) => items.map((item) => (item.id === data.client.id ? data.client : item)));
      setCreatedMessage(`${data.client.company} workspace updated.`);
      setEditingId("");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setSavingId("");
    }
  }

  async function deleteWorkspace(client) {
    if (!window.confirm(`Delete ${client.company}? This removes the workspace record.`)) return;

    setStatus("");
    setCreatedMessage("");
    setDeletingId(client.id);
    try {
      const token = await getToken();
      await apiRequest(`/api/clients/${client.id}`, token, { method: "DELETE" });
      setClients((items) => items.filter((item) => item.id !== client.id));
      if (selectedClientId === client.id) {
        setSelectedClientId("");
        setActiveTab("workspace");
      }
      if (editingId === client.id) {
        setEditingId("");
      }
      setCreatedMessage(`${client.company} workspace deleted.`);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setDeletingId("");
    }
  }

  return (
    <div className="workspace-stack">
      <section className="workspace-hero">
        <div>
          <span className="eyebrow">Default workspace</span>
          <h2>Workspace directory</h2>
          <p>Create a separate workspace for every client or project. Open a workspace to manage its prompts, docs, and delivery package.</p>
        </div>
        <div className="workspace-actions">
          <button className="primary" onClick={() => document.getElementById("workspace-company")?.focus()}>Create workspace</button>
        </div>
      </section>

      <section className="metric-grid">
        <Metric label="Workspaces" value={clients.length} detail="Separate operating entities" />
        <Metric label="Default view" value="Directory" detail="Workspace management only" />
        <Metric label="Primary platform" value="Elk" detail="Default build target" />
        <Metric label="Workspace scope" value="Separate" detail="Prompt versions stay inside each workspace" />
      </section>

      <section className="workspace-layout directory-only">
        <Panel title="Workspace directory">
          <form className="form-grid" onSubmit={createClient}>
            <label>
              Workspace name
              <input
                id="workspace-company"
                value={form.company}
                onChange={(event) => setForm({ ...form, company: event.target.value })}
                required
              />
            </label>
            <TextInput label="Industry" value={form.industry} onChange={(industry) => setForm({ ...form, industry })} />
            <SelectInput label="Platform" value={form.platform} options={platforms} onChange={(platform) => setForm({ ...form, platform })} />
            <SelectInput label="Status" value={form.status} options={["Discovery", "Build package", "Production QA", "Production"]} onChange={(status) => setForm({ ...form, status })} />
          <button className="primary wide" disabled={creating}>{creating ? "Creating..." : "Create workspace"}</button>
          </form>
          {createdMessage && <div className="notice success">{createdMessage}</div>}
          <div className="workspace-list">
            <List
              items={clients}
              empty="No workspaces yet."
              render={(client) => (
                <div className="workspace-record">
                  <button
                    className={client.id === selectedClientId ? "workspace-row active" : "workspace-row"}
                    onClick={() => {
                      setSelectedClientId(client.id);
                      setActiveTab("agents");
                    }}
                  >
                    <span>
                      <strong>{client.company}</strong>
                      <p>{client.industry || "No industry"} - {client.platform} - {client.status}</p>
                    </span>
                    <em>{client.id === selectedClientId ? "Open" : "View"}</em>
                  </button>
                  <div className="workspace-row-actions">
                    <button type="button" onClick={() => startEdit(client)}>Edit</button>
                    <button
                      type="button"
                      className="danger"
                      disabled={deletingId === client.id}
                      onClick={() => deleteWorkspace(client)}
                    >
                      {deletingId === client.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                  {editingId === client.id && (
                    <form className="workspace-edit form-grid" onSubmit={saveWorkspace}>
                      <TextInput label="Workspace name" value={editForm.company} onChange={(company) => setEditForm({ ...editForm, company })} required />
                      <TextInput label="Industry" value={editForm.industry} onChange={(industry) => setEditForm({ ...editForm, industry })} />
                      <SelectInput label="Platform" value={editForm.platform} options={platforms} onChange={(platform) => setEditForm({ ...editForm, platform })} />
                      <SelectInput label="Status" value={editForm.status} options={["Discovery", "Build package", "Production QA", "Production"]} onChange={(status) => setEditForm({ ...editForm, status })} />
                      <div className="wide workspace-edit-actions">
                        <button className="primary" disabled={savingId === client.id}>
                          {savingId === client.id ? "Saving..." : "Save workspace"}
                        </button>
                        <button type="button" onClick={() => setEditingId("")}>Cancel</button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            />
          </div>
        </Panel>
      </section>
    </div>
  );
}

function AgentPromptPage({ selectedClient, promptJobs, setPromptJobs, getToken, setStatus, setActiveTab }) {
  const manualVersions = [...promptJobs].filter(
    (job) => job.type === "manual-agent-prompt" && job.client === selectedClient?.company
  );
  const sortedVersions = manualVersions.sort((a, b) => {
    const left = new Date(a.createdAt || 0).getTime();
    const right = new Date(b.createdAt || 0).getTime();
    return right - left;
  });
  const latestVersion = sortedVersions[0] || null;
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [promptDraft, setPromptDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const selectedVersion = sortedVersions.find((job) => job.id === selectedVersionId) || latestVersion;

  useEffect(() => {
    setSelectedVersionId(latestVersion?.id || "");
    setPromptDraft(latestVersion?.output || latestVersion?.agentPrompt || "");
    setCopyStatus("");
  }, [latestVersion?.id, selectedClient?.id]);

  function selectVersion(versionId) {
    const version = sortedVersions.find((job) => job.id === versionId);
    setSelectedVersionId(versionId);
    setPromptDraft(version?.output || version?.agentPrompt || "");
    setCopyStatus("");
  }

  async function savePrompt(event) {
    event.preventDefault();
    setStatus("");
    setCopyStatus("");
    setSaving(true);
    try {
      const token = await getToken();
      const data = await apiRequest("/api/agent-prompts", token, {
        method: "POST",
        body: JSON.stringify({
          client: selectedClient.company,
          platform: selectedClient.platform || "Elk",
          prompt: promptDraft
        })
      });
      setPromptJobs((items) => [data.promptJob, ...items]);
      setSelectedVersionId(data.promptJob.id);
      setPromptDraft(data.promptJob.output || "");
      setCopyStatus(sortedVersions.length ? "Prompt updated." : "Prompt saved.");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(promptDraft);
      setCopyStatus("Copied.");
    } catch {
      setCopyStatus("Copy failed.");
    }
  }

  return (
    <div className="agent-stack">
      <section className="agent-hero">
        <div>
          <span className="eyebrow">Agent prompts</span>
          <h2>{selectedClient?.company || "Default workspace"} prompt versions</h2>
          <p>
            Paste the active agent prompt here. Saving creates the first version, and every update
            creates a new version so previous prompts stay available.
          </p>
        </div>
        <div className="agent-current">
          <span>Active version</span>
          <strong>{latestVersion ? `v${sortedVersions.length}` : "No version"}</strong>
          <p>{latestVersion ? `${latestVersion.createdAt ? new Date(latestVersion.createdAt).toLocaleString() : "Saved prompt"}` : "Paste and save a prompt to start versioning."}</p>
        </div>
      </section>

      <section className="agent-editor-layout">
        <Panel title="Prompt editor">
          <form className="agent-editor" onSubmit={savePrompt}>
            <div className="prompt-editor-head">
              <div>
                <strong>{selectedVersion ? "Editing from saved version" : "New prompt"}</strong>
                <p>{selectedVersion?.createdAt ? new Date(selectedVersion.createdAt).toLocaleString() : "Paste a prompt to create version 1."}</p>
              </div>
              <label className="version-select">
                Version
                <select
                  value={selectedVersionId}
                  onChange={(event) => selectVersion(event.target.value)}
                  disabled={!sortedVersions.length}
                >
                  {!sortedVersions.length && <option value="">No versions</option>}
                  {sortedVersions.map((job, index) => (
                    <option key={job.id} value={job.id}>
                      v{sortedVersions.length - index} - {job.createdAt ? new Date(job.createdAt).toLocaleString() : "Saved prompt"}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <textarea
              className="agent-prompt-input"
              value={promptDraft}
              onChange={(event) => {
                setPromptDraft(event.target.value);
                setCopyStatus("");
              }}
              placeholder="Paste the full agent prompt here."
              required
            />

            <div className="prompt-editor-actions">
              <button className="primary" disabled={saving || !promptDraft.trim()}>
                {saving ? "Saving..." : sortedVersions.length ? "Update prompt" : "Save prompt"}
              </button>
              <button type="button" onClick={copyPrompt} disabled={!promptDraft.trim()}>
                Copy prompt
              </button>
              {copyStatus && <span>{copyStatus}</span>}
            </div>
          </form>
        </Panel>
      </section>
    </div>
  );
}

function OptimizePage({ selectedClient, busy, setBusy, getToken, setStatus, promptOutput, setPromptOutput }) {
  const [form, setForm] = useState({
    client: selectedClient?.company || "Default workspace",
    previousPrompt: "",
    clientFeedback: "",
    optimizationTarget: "Improve overall quality",
    llmProvider: "OpenRouter",
    llmModel: "OpenRouter auto model",
    skillSelection: "Standard review",
    autonomy: "AI-led",
    attachments: []
  });

  useEffect(() => {
    setForm((current) => ({
      ...current,
      client: selectedClient?.company || "Default workspace"
    }));
  }, [selectedClient?.company]);

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
      <Panel title="Prompt revision">
        <form className="form-stack" onSubmit={optimizePrompt}>
          <BrainPanel form={form} setForm={setForm} />
          <label>
            Current prompt
            <textarea value={form.previousPrompt} onChange={(event) => setForm({ ...form, previousPrompt: event.target.value })} />
          </label>
          <label>
            Notes
            <textarea value={form.clientFeedback} onChange={(event) => setForm({ ...form, clientFeedback: event.target.value })} placeholder="Paste feedback, call notes, objections, or review notes here." />
          </label>
          <SourceFilesInput value={form.attachments} onChange={(attachments) => setForm({ ...form, attachments })} />
          <SelectInput label="Revision goal" value={form.optimizationTarget} options={["Improve overall quality", "Shorter responses", "Clearer call flow", "Stronger guardrails", "Lower latency"]} onChange={(optimizationTarget) => setForm({ ...form, optimizationTarget })} />
          <button className="primary">{busy ? "Creating..." : "Create revision"}</button>
        </form>
      </Panel>
      <PromptOutput job={promptOutput} mode="elk" title="Elk builder output" />
      <PromptLifecyclePanel job={promptOutput} />
    </section>
  );
}

function NewPromptPage({ selectedClient, busy, setBusy, getToken, setStatus, promptOutput, setPromptOutput }) {
  const [form, setForm] = useState({
    client: selectedClient?.company || "Default workspace",
    agentType: "Inbound",
    industry: "",
    voiceStyle: "Warm, concise, professional",
    llmProvider: "OpenRouter",
    llmModel: "OpenRouter auto model",
    temperature: "0.4",
    maxTokens: "4000",
    reasoningMode: "Balanced",
    skillSelection: "Standard package",
    autonomy: "AI-led",
    platform: "Elk",
    sourceBrief: "",
    attachments: []
  });

  useEffect(() => {
    setForm((current) => ({
      ...current,
      client: selectedClient?.company || "Default workspace",
      industry: current.industry || selectedClient?.industry || "",
      platform: selectedClient?.platform || current.platform || "Elk"
    }));
  }, [selectedClient?.company, selectedClient?.industry, selectedClient?.platform]);

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
      <Panel title="Create build package">
        <form className="form-grid" onSubmit={generatePrompt}>
          <div className="wide">
            <BrainPanel form={form} setForm={setForm} />
          </div>
          <SelectInput label="Agent type" value={form.agentType} options={agentTypes} onChange={(agentType) => setForm({ ...form, agentType })} />
          <TextInput label="Industry" value={form.industry} onChange={(industry) => setForm({ ...form, industry })} />
          <SelectInput label="Platform" value={form.platform} options={platforms} onChange={(platform) => setForm({ ...form, platform })} />
          <label className="wide">
            Source notes
            <textarea value={form.sourceBrief} onChange={(event) => setForm({ ...form, sourceBrief: event.target.value })} />
          </label>
          <div className="wide">
            <SourceFilesInput value={form.attachments} onChange={(attachments) => setForm({ ...form, attachments })} />
          </div>
          <button className="primary wide">{busy ? "Creating..." : "Create package"}</button>
        </form>
      </Panel>
      <PromptOutput job={promptOutput} mode="prompt" title="Prompt output" />
      <PromptLifecyclePanel job={promptOutput} />
    </section>
  );
}

function DocsPage({ selectedClient, busy, setBusy, getToken, setStatus, promptOutput, setPromptOutput }) {
  const [form, setForm] = useState({
    client: selectedClient?.company || "Default workspace",
    voiceStyle: "Warm, concise, professional",
    llmProvider: "OpenRouter",
    llmModel: "OpenRouter auto model",
    temperature: "0.4",
    maxTokens: "4000",
    reasoningMode: "Balanced",
    skillSelection: "Standard docs",
    autonomy: "Approval-led",
    platform: selectedClient?.platform || "Elk",
    agentType: "Inbound",
    sourceBrief: "",
    attachments: []
  });
  const docOptions = ["Blueprint", "Call script", "Call flow", "Integration blueprint"];
  const [selectedDocs, setSelectedDocs] = useState(docOptions);

  useEffect(() => {
    setForm((current) => ({
      ...current,
      client: selectedClient?.company || "Default workspace",
      platform: selectedClient?.platform || current.platform || "Elk"
    }));
  }, [selectedClient?.company, selectedClient?.platform]);

  async function generateDocs(event) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      const token = await getToken();
      const data = await apiRequest("/api/prompts/generate", token, {
        method: "POST",
        body: JSON.stringify({
          ...form,
          requestedDocs: selectedDocs,
          sourceBrief: form.sourceBrief
        })
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
      <Panel title="Production docs">
        <form className="form-grid" onSubmit={generateDocs}>
          <fieldset className="wide checkbox-group">
            <legend>Documents</legend>
            {docOptions.map((docName) => (
              <label className="checkbox-row" key={docName}>
                <input
                  type="checkbox"
                  checked={selectedDocs.includes(docName)}
                  onChange={(event) => {
                    setSelectedDocs((current) =>
                      event.target.checked
                        ? [...current, docName]
                        : current.filter((item) => item !== docName)
                    );
                  }}
                />
                {docName}
              </label>
            ))}
          </fieldset>
          <label className="wide">
            Source notes
            <textarea value={form.sourceBrief} onChange={(event) => setForm({ ...form, sourceBrief: event.target.value })} placeholder="Paste transcript, notes, or requirements here." required />
          </label>
          <div className="wide">
            <SourceFilesInput value={form.attachments} onChange={(attachments) => setForm({ ...form, attachments })} />
          </div>
          <button className="primary wide">{busy ? "Creating docs..." : "Create docs"}</button>
        </form>
      </Panel>
      <PromptOutput job={promptOutput} mode="docs" title="Docs output" showPrompt={false} />
      <DiagramSkillPanel />
    </section>
  );
}

function DiagramSkillPanel() {
  return (
    <Panel title="Document standards">
      <List
        items={[
          { id: "clear", title: "Clear ownership", body: "Each document should show what the agent does, what it needs, and who reviews it." },
          { id: "usable", title: "Ready to share", body: "Keep the final copy concise, structured, and client-ready." },
          { id: "gaps", title: "Open questions", body: "Record missing requirements instead of hiding assumptions." }
        ]}
        empty="No standards configured."
        render={(item) => (
          <>
            <strong>{item.title}</strong>
            <p>{item.body}</p>
          </>
        )}
      />
    </Panel>
  );
}

function isTextLikeFile(file) {
  const name = String(file?.name || "").toLowerCase();
  return (
    String(file?.type || "").startsWith("text/") ||
    ["application/json", "application/xml", "application/csv"].includes(file?.type) ||
    /\.(txt|md|csv|json|xml|yaml|yml|log)$/i.test(name)
  );
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read file."));
    reader.readAsText(file);
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Could not read file."));
    reader.readAsArrayBuffer(file);
  });
}

function extractPdfText(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer || []);
  const raw = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  const fragments = [];

  for (const match of raw.matchAll(/\(([^()]{3,500})\)/g)) {
    fragments.push(match[1]);
  }

  for (const match of raw.matchAll(/<([0-9A-Fa-f\s]{6,800})>/g)) {
    const hex = match[1].replace(/\s+/g, "");
    let text = "";
    for (let index = 0; index < hex.length; index += 2) {
      const code = Number.parseInt(hex.slice(index, index + 2), 16);
      if (code >= 32 && code <= 126) text += String.fromCharCode(code);
    }
    if (text.trim().length > 2) fragments.push(text);
  }

  return fragments
    .join(" ")
    .replace(/\\[nrt]/g, " ")
    .replace(/\\([()\\])/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12000);
}

async function readFilesAsAttachments(fileList) {
  const files = Array.from(fileList || []).slice(0, 10);
  const attachments = [];

  for (const file of files) {
    const attachment = {
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size
    };

    if (isTextLikeFile(file)) {
      attachment.text = (await readFileAsText(file)).slice(0, 12000);
    } else if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
      const buffer = await readFileAsArrayBuffer(file);
      attachment.text = extractPdfText(buffer);
      attachment.dataUrl = await readFileAsDataUrl(file);
    } else if (String(file.type || "").startsWith("image/")) {
      attachment.dataUrl = await readFileAsDataUrl(file);
    } else {
      attachment.dataUrl = await readFileAsDataUrl(file);
    }

    attachments.push(attachment);
  }

  return attachments;
}

function SourceFilesInput({ value = [], onChange }) {
  const [fileStatus, setFileStatus] = useState("");

  async function handleFiles(event) {
    setFileStatus("Reading files...");
    try {
      const attachments = await readFilesAsAttachments(event.target.files);
      onChange(attachments);
      setFileStatus(attachments.length ? `${attachments.length} file${attachments.length === 1 ? "" : "s"} attached.` : "");
    } catch {
      setFileStatus("Could not read one of the files.");
    }
  }

  return (
    <label className="file-input">
      Attach source files
      <input type="file" multiple accept=".txt,.md,.csv,.json,.xml,.yaml,.yml,.pdf,.doc,.docx,image/*" onChange={handleFiles} />
      <span>{fileStatus || (value.length ? `${value.length} file${value.length === 1 ? "" : "s"} attached.` : "Add docs, PDFs, images, or notes as source input.")}</span>
    </label>
  );
}

function BrainPanel({ form, setForm }) {
  return (
    <section className="brain-panel">
      <div>
        <h2>Model settings</h2>
        <p>Choose the model behavior for this package.</p>
      </div>
      <div className="brain-grid">
        <SelectInput label="Provider" value={form.llmProvider} options={llmProviders} onChange={(llmProvider) => setForm({ ...form, llmProvider })} />
        <SelectInput label="Model" value={form.llmModel} options={llmModels} onChange={(llmModel) => setForm({ ...form, llmModel })} />
        <TextInput label="Temperature" value={form.temperature || "0.4"} onChange={(temperature) => setForm({ ...form, temperature })} />
        <TextInput label="Token limit" value={form.maxTokens || "4000"} onChange={(maxTokens) => setForm({ ...form, maxTokens })} />
        <SelectInput label="Reasoning" value={form.reasoningMode || "Balanced"} options={["Fast", "Balanced", "Deep"]} onChange={(reasoningMode) => setForm({ ...form, reasoningMode })} />
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

function buildDownloadFilename(job, extension = "pdf") {
  const client = typeof job === "object" ? job?.client : "";
  const safeClient = String(client || "inspra-docs")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${safeClient || "inspra-docs"}-docs.${extension}`;
}

function buildDocsContent(job, artifactItems) {
  const sections = [];

  artifactItems
    .filter((item) => item.value)
    .forEach((item) => {
      sections.push(`## ${item.title}\n\n${item.value}`);
    });

  return sections.join("\n\n");
}

function stripMarkdown(value) {
  return String(value || "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\|/g, "  ")
    .replace(/`/g, "")
    .replace(/\s+->\s+/g, " -> ")
    .trim();
}

function escapePdfText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E\n]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrapPdfLine(line, maxChars) {
  const words = String(line || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  });

  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function pdfColor(hex) {
  const value = String(hex || "#000000").replace("#", "");
  const r = Number.parseInt(value.slice(0, 2), 16) / 255;
  const g = Number.parseInt(value.slice(2, 4), 16) / 255;
  const b = Number.parseInt(value.slice(4, 6), 16) / 255;
  return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)}`;
}

function addPdfText(commands, text, x, y, size = 9, color = "#1A1A1A") {
  commands.push(`${pdfColor(color)} rg`, "BT", `/F1 ${size} Tf`, `${x} ${y} Td`, `(${escapePdfText(text)}) Tj`, "ET");
}

function addPdfRect(commands, x, y, width, height, fill, stroke = "#DDDDDD", lineWidth = 1) {
  commands.push(`${pdfColor(fill)} rg`, `${pdfColor(stroke)} RG`, `${lineWidth} w`, `${x} ${y} ${width} ${height} re B`);
}

function addPdfLine(commands, x1, y1, x2, y2, color = "#555555", lineWidth = 1) {
  commands.push(`${pdfColor(color)} RG`, `${lineWidth} w`, `${x1} ${y1} m ${x2} ${y2} l S`);
}

function addWrappedPdfText(commands, text, x, y, maxChars, lineHeight, size, color) {
  wrapPdfLine(text, maxChars).slice(0, 3).forEach((line, index) => {
    addPdfText(commands, line, x, y - index * lineHeight, size, color);
  });
}

function drawSystemBox(commands, box) {
  addPdfRect(commands, box.x, box.y, box.w, box.h, box.fill, box.stroke, 1.1);
  addWrappedPdfText(commands, box.title, box.x + 8, box.y + box.h - 15, 18, 10, 8.4, "#1A1A1A");
  if (box.subtitle) {
    addWrappedPdfText(commands, box.subtitle, box.x + 8, box.y + 14, 21, 8, 6.7, "#777777");
  }
}

function drawSwimlaneDiagram(commands, title) {
  const pageWidth = 842;
  const brand = "#39E100";
  const brandDark = "#1A3A00";
  const rowX = 34;
  const rowW = pageWidth - 68;
  const labelW = 82;
  const rowH = 74;
  const rows = [
    {
      label: "CURRENT STATE",
      y: 380,
      fill: "#EEF2FF",
      stroke: "#7090CC",
      boxes: [
        ["Source Notes", "Approved client inputs", "#F0F0F0", "#888888"],
        ["Existing Systems", "CRM / calendar / forms", "#E8F0FE", "#4A6FA5"],
        ["Human Handoff", "Manual review path", "#E8F0FE", "#4A6FA5"]
      ]
    },
    {
      label: "PROPOSED PHASE 1",
      y: 275,
      fill: "#EDFCE5",
      stroke: brand,
      boxes: [
        ["AI Voice Agent", "Short approved answers", "#E8FAE0", brand],
        ["Tool Router", "Booking / callback action", "#F3EEFF", "#7B2FBE"],
        ["CRM Writeback", "Notes and outcomes", "#E8F0FE", "#4A6FA5"],
        ["Specialist", "Final fit and next step", "#F0F0F0", "#888888"]
      ]
    },
    {
      label: "MONITORED OPERATION",
      y: 170,
      fill: "#FFF8EE",
      stroke: "#E07000",
      boxes: [
        ["QA Evidence", "Scenario validation", "#FFF3E0", "#E07000"],
        ["Workflow Logs", "Success / failure checks", "#F3EEFF", "#7B2FBE"],
        ["Obsidian Learning", "Reusable release notes", "#E8FAE0", brand]
      ]
    }
  ];

  addPdfText(commands, "INSPRA AI", 36, 548, 15, brandDark);
  addPdfText(commands, title, 265, 550, 14, "#1A1A1A");
  addPdfText(commands, "Swim Lane Blueprint | Diagram-Skill-v2 aligned | v1", 300, 532, 8.5, "#777777");
  addPdfLine(commands, 34, 515, 808, 515, "#DDDDDD", 0.8);

  const legend = [
    ["Existing System", "#E8F0FE", "#4A6FA5"],
    ["New / Central Hub", "#F3EEFF", "#7B2FBE"],
    ["Inspra AI System", "#E8FAE0", brand],
    ["Future / TBC", "#FFF3E0", "#E07000"],
    ["Neutral / Endpoint", "#F0F0F0", "#888888"]
  ];
  legend.forEach(([label, fill, stroke], index) => {
    const x = 78 + index * 145;
    addPdfRect(commands, x, 493, 18, 11, fill, stroke, 1);
    addPdfText(commands, label, x + 25, 495, 7.2, "#444444");
  });

  rows.forEach((row) => {
    addPdfRect(commands, rowX, row.y, rowW, rowH, row.fill, row.stroke, 1.3);
    addPdfRect(commands, rowX + 12, row.y + 17, labelW, 40, row.fill, row.stroke, 1.1);
    addWrappedPdfText(commands, row.label, rowX + 20, row.y + 41, 12, 10, 7.2, row.stroke);

    const laneX = rowX + labelW + 44;
    const laneW = rowW - labelW - 78;
    const boxW = row.boxes.length > 3 ? 112 : 128;
    const boxH = 42;
    const gap = (laneW - row.boxes.length * boxW) / Math.max(1, row.boxes.length - 1);
    const boxY = row.y + 16;
    const placed = row.boxes.map((box, index) => ({
      x: laneX + index * (boxW + gap),
      y: boxY,
      w: boxW,
      h: boxH,
      title: box[0],
      subtitle: box[1],
      fill: box[2],
      stroke: box[3]
    }));

    placed.forEach((box, index) => {
      drawSystemBox(commands, box);
      if (index < placed.length - 1) {
        const startX = box.x + box.w + 6;
        const endX = placed[index + 1].x - 6;
        const y = box.y + box.h / 2;
        addPdfLine(commands, startX, y, endX, y, "#555555", 1);
        addPdfText(commands, ">", endX - 3, y - 3, 8, "#555555");
      }
    });
  });

  addPdfText(commands, "Open Questions", 44, 128, 9, "#1A1A1A");
  [
    "Confirm system of record and field ownership.",
    "Confirm booking/callback success and failure behavior.",
    "Confirm approval owner before production release."
  ].forEach((question, index) => {
    const x = 44 + index * 250;
    addPdfRect(commands, x, 92, 22, 22, "#FF6B00", "#FF6B00", 1);
    addPdfText(commands, String(index + 1), x + 8, 99, 8, "#FFFFFF");
    addWrappedPdfText(commands, question, x + 30, 107, 31, 10, 7.4, "#444444");
  });

  addPdfLine(commands, 34, 52, 808, 52, "#DDDDDD", 0.8);
  addPdfText(commands, "Inspra AI", 44, 34, 7.5, "#777777");
  addPdfText(commands, "Confidential client blueprint", 362, 34, 7.5, "#777777");
}

function createDiagramPdf(title, artifactItems) {
  const pageWidth = 842;
  const pageHeight = 595;
  const margin = 48;
  const sections = artifactItems.filter((item) => item.value);
  const pages = [
    {
      title,
      subtitle: "Client-facing documentation package",
      body: [
        "This PDF is prepared as a readable blueprint and write-up, not as source code.",
        "Each selected document is separated into its own section for review and sharing."
      ],
      visual: "cover"
    },
    {
      title: `${title} - Swim Lane Blueprint`,
      subtitle: "Diagram-Skill-v2 aligned blueprint",
      body: [],
      visual: "swimlane"
    },
    ...sections.map((item) => ({
      title: item.title,
      subtitle: item.diagram ? "Diagram-oriented workflow" : "Production document",
      body: stripMarkdown(item.value)
        .split(/\r?\n/)
        .flatMap((line) => wrapPdfLine(line.trim(), 78))
        .filter(Boolean)
        .slice(0, 42),
      visual: item.diagram ? "flow" : "writeup"
    }))
  ];

  const objects = [];
  const addObject = (body) => {
    objects.push(body);
    return objects.length;
  };

  const catalogId = addObject("<< /Type /Catalog /Pages 2 0 R >>");
  const pagesId = addObject("");
  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageRefs = [];

  pages.forEach((page, pageIndex) => {
    const commands = [`${pdfColor("#FFFFFF")} rg`, `0 0 ${pageWidth} ${pageHeight} re f`];

    if (page.visual === "swimlane") {
      drawSwimlaneDiagram(commands, page.title);
    } else {
      addPdfRect(commands, margin, pageHeight - 94, pageWidth - margin * 2, 54, "#F7FBF8", "#1A3A00", 1.4);
      addPdfText(commands, "INSPRA AI", margin + 18, pageHeight - 64, 13, "#1A3A00");
      addPdfText(commands, page.title, margin + 150, pageHeight - 64, 16, "#1A1A1A");
      addPdfText(commands, page.subtitle, margin + 150, pageHeight - 82, 9, "#777777");
      addPdfRect(commands, margin, pageHeight - 160, pageWidth - margin * 2, 42, "#EDFCE5", "#39E100", 1);
      addPdfText(commands, page.visual === "cover" ? "Document Package" : "Companion Write-up", margin + 16, pageHeight - 135, 11, "#1A3A00");

      const startY = pageHeight - 195;
      page.body.forEach((line, index) => {
        addPdfText(commands, line, margin, startY - index * 13, 9, "#1A1A1A");
      });
    }
    addPdfText(commands, `${pageIndex + 1} of ${pages.length}`, pageWidth - margin - 34, 30, 8, "#777777");
    const stream = commands.join("\n");
    const contentId = addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageRefs.push(`${pageId} 0 R`);
  });

  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageRefs.join(" ")}] /Count ${pageRefs.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return pdf;
}

function downloadDocsPdf(job, artifactItems) {
  if (!buildDocsContent(job, artifactItems)) return;

  const title = `${typeof job === "object" && job?.client ? job.client : "Inspra"} Documentation Package`;
  const pdf = createDiagramPdf(title, artifactItems);
  const blob = new Blob([pdf], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = buildDownloadFilename(job, "pdf");
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function getArtifactItems(job, mode) {
  const docs = [
    { title: "Blueprint", value: job?.blueprint, diagram: true },
    { title: "Call script", value: job?.callScript || job?.salesScript },
    { title: "Call flow", value: job?.callFlowChart, diagram: true },
    { title: "Integration blueprint", value: job?.integrationBlueprint || job?.integrationFlowchart, diagram: true }
  ];
  const elk = [
    { title: "Agent description", value: job?.elkDescription },
    { title: "Schema", value: job?.elkSchema },
    { title: "Request body", value: job?.elkPostBody },
    { title: "Function notes", value: job?.elkFunctionConfig }
  ];

  if (mode === "docs") return docs;
  if (mode === "elk") return elk;
  return docs;
}

function PromptOutput({ job, showPrompt = true, mode = "prompt", title = "Package output" }) {
  const output = typeof job === "string" ? job : job?.output;
  const [copyStatus, setCopyStatus] = useState("");
  const artifactItems = getArtifactItems(job, mode);
  const canDownload = Boolean(buildDocsContent(job, artifactItems));
  const showCopy = mode !== "docs";
  const showDownload = mode === "docs";

  async function copyGeneratedPrompt() {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopyStatus("Copied.");
    } catch {
      setCopyStatus("Copy failed.");
    }
  }

  return (
    <Panel title={title}>
      <div className="output-actions">
        {showCopy && <button type="button" onClick={copyGeneratedPrompt} disabled={!output}>
          Copy prompt
        </button>}
        {showDownload && <button type="button" onClick={() => downloadDocsPdf(job, artifactItems)} disabled={!canDownload}>
          Download docs PDF
        </button>}
        {copyStatus && <span>{copyStatus}</span>}
      </div>
      {showPrompt && <pre className="prompt-output">{output || "Your generated package will appear here."}</pre>}
      {!showPrompt && !canDownload && <pre className="prompt-output">Your generated documents will appear here.</pre>}
      {job && typeof job === "object" && (
        <div className="artifact-grid">
          {artifactItems.map((item) => (
            <Artifact key={item.title} title={item.title} value={item.value} />
          ))}
        </div>
      )}
    </Panel>
  );
}

function Artifact({ title, value }) {
  if (!value) return null;
  return (
    <details className="artifact">
      <summary>{title}</summary>
      <pre>{value}</pre>
    </details>
  );
}

function PromptLifecyclePanel({ job }) {
  const hasPrompt = Boolean(typeof job === "string" ? job : job?.output);
  const testReport = typeof job === "object" ? job?.testReport : "";
  const deploymentPackage = typeof job === "object" ? job?.deploymentPackage : "";

  return (
    <section className="lifecycle-panel">
      <Panel title="QA testing">
        <div className="list">
          <div className="list-item"><strong>Checklist</strong><p>Review role, tone, guardrails, transfer paths, and data handling.</p></div>
          <div className="list-item"><strong>Readiness</strong><p>{job?.qaGates || "Create a package to prepare the review checklist."}</p></div>
          <div className="list-item"><strong>Test notes</strong><p>{testReport || "QA notes will appear after a package is created."}</p></div>
          <button disabled={!hasPrompt}>Run QA testing</button>
        </div>
      </Panel>
      <Panel title="Release">
        <div className="list">
          <div className="list-item"><strong>Package</strong><p>{deploymentPackage || "Release notes and handoff details will appear here."}</p></div>
          <div className="list-item"><strong>Approval</strong><p>{job?.releasePolicy || "Review and approve the package before using it live."}</p></div>
          <button className="primary" disabled={!hasPrompt}>Mark ready</button>
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
      {items.map((item, index) => (
        <div className="list-item" key={item.id}>
          {render(item, index)}
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

