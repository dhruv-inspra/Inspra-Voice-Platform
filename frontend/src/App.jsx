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
  { id: "docs", label: "Docs Studio" },
  { id: "elkBuilder", label: "Elk Builder" }
];

function readInviteToken() {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("invite");
}

const platforms = ["Elk", "Retell", "Vapi"];
const agentTypes = ["Inbound", "Outbound"];
const MAX_ATTACHMENT_MB = 10;
const MAX_ATTACHMENT_BYTES = MAX_ATTACHMENT_MB * 1024 * 1024;
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
  const activeClients = clients.filter((client) => client.status !== "Retired / Paused").length;

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
        <Metric label="Total workspaces" value={clients.length} detail="Separate operating entities" />
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
  const [activeTab, setActiveTab] = useState("overview");
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

  const openWorkspace = useCallback((clientId, tab = "agents") => {
    if (!clientId) return;
    setSelectedClientId(clientId);
    setActiveTab(tab);
  }, []);

  const tabs = useMemo(
    () =>
      isDefaultWorkspace
        ? [
            { id: "overview", label: "Overview" },
            { id: "buildStudio", label: "Build Studio" },
            { id: "docs", label: "Docs Studio" },
            { id: "elkBuilder", label: "Elk Builder" },
            { id: "organizations", label: "Organizations", hidden: true },
            { id: "profile", label: "Settings" }
          ]
        : [...baseTabs, { id: "profile", label: "Settings" }],
    [isDefaultWorkspace]
  );

  useEffect(() => {
    if (!tabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(tabs[0]?.id || "overview");
    }
  }, [activeTab, tabs]);

  const pageMeta = useMemo(
    () => ({
      overview: "Manage your organization's workspaces and delivery status.",
      agents: `${selectedClient.company} prompt editor and version history.`,
      buildStudio: `Create a complete delivery package for ${selectedClient.company}.`,
      docs: `Prepare client-ready documentation for ${selectedClient.company}.`,
      elkBuilder: `Review and refine the active prompt for ${selectedClient.company}.`,
      organizations: "Choose the workspace you want to open.",
      profile: "Manage your workspace settings and preferences."
    }),
    [selectedClient.company]
  );

  const currentTitle = useMemo(
    () => tabs.find((tab) => tab.id === activeTab)?.label || tabs[0]?.label || "Overview",
    [tabs, activeTab]
  );

  return (
    <div className={`app-shell layout-${layoutMode}${activeTab === "organizations" ? " organization-mode" : ""}`}>
      <aside className="sidebar">
        <div className="brand-row">
          <div>
            <img className="brand-wordmark" src="/brand/inspra-wordmark.png" alt="Inspra" />
          </div>
        </div>

        <nav className="side-nav">
          {tabs.filter((tab) => !tab.hidden).map((tab) => (
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
          <div className="sidebar-organization">
            <span>{isDefaultWorkspace ? "Workspace" : "Organization"}</span>
            <button
              type="button"
              onClick={() => {
                setSelectedClientId("");
                setActiveTab(isDefaultWorkspace ? "organizations" : "overview");
              }}
            >
              <strong>{isDefaultWorkspace ? "Back to workspace" : "Organizations"}</strong>
              <small>
                {isDefaultWorkspace
                  ? "Organizations"
                  : "Organization overview"}
              </small>
            </button>
          </div>
          <div className="sidebar-user">
            <span className="sidebar-avatar">
              {(user.user_metadata?.name || user.user_metadata?.full_name || user.email || "?").slice(0, 1).toUpperCase()}
            </span>
            <span>
              <strong>{user.user_metadata?.name || user.user_metadata?.full_name || user.email}</strong>
              <small>{user.email}</small>
            </span>
          </div>
          <button className="ghost" onClick={() => supabase.auth.signOut()}>
            Log out
          </button>
        </div>
      </aside>

      <main className="workspace">
        {activeTab !== "organizations" && <header className="topbar">
          <div>
            <h1>{currentTitle}</h1>
            <p>{pageMeta[activeTab]}</p>
          </div>
          <div className="topbar-actions">
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
        </header>}

        {status && <div className="notice">{status}</div>}

        {isDefaultWorkspace && activeTab === "overview" && (
          <ClientWorkspacePage
            clients={clients}
            tasks={tasks}
            promptOutput={buildOutput || docsOutput || elkOutput}
            setClients={setClients}
            selectedClientId={selectedClientId}
            setSelectedClientId={setSelectedClientId}
            openWorkspace={openWorkspace}
            getToken={getToken}
            setStatus={setStatus}
            setActiveTab={setActiveTab}
            currentUserId={user.id}
            user={user}
            isAdmin={isAdmin}
          />
        )}
        {isDefaultWorkspace && activeTab === "organizations" && (
          <ClientWorkspacePage
            clients={clients}
            tasks={tasks}
            promptOutput={buildOutput || docsOutput || elkOutput}
            setClients={setClients}
            selectedClientId={selectedClientId}
            setSelectedClientId={setSelectedClientId}
            openWorkspace={openWorkspace}
            getToken={getToken}
            setStatus={setStatus}
            setActiveTab={setActiveTab}
            currentUserId={user.id}
            user={user}
            isAdmin={isAdmin}
            viewMode="picker"
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
  const [settingsTab, setSettingsTab] = useState("general");

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
    <div className="profile-stack settings-screen">
      <nav className="settings-tabs" aria-label="Settings sections">
        <button
          type="button"
          className={settingsTab === "general" ? "active" : ""}
          onClick={() => setSettingsTab("general")}
        >
          General
        </button>
        <button
          type="button"
          className={settingsTab === "creds" ? "active" : ""}
          onClick={() => setSettingsTab("creds")}
        >
          User Creds
        </button>
      </nav>

      <section className="settings-layout">
        {settingsTab === "general" && <Panel title="General Settings">
          <p className="panel-subtitle">Basic workspace information</p>
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
        </Panel>}

        {settingsTab === "creds" && <Panel title="User Credentials">
          <p className="panel-subtitle">Account access and authentication</p>
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
        </Panel>}
      </section>

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
    <section className="studio-stack">
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
  tasks = [],
  promptOutput,
  setClients,
  selectedClientId,
  setSelectedClientId,
  openWorkspace,
  getToken,
  setStatus,
  setActiveTab,
  currentUserId,
  user,
  isAdmin,
  viewMode = "management"
}) {
  const [form, setForm] = useState({ company: "", industry: "", platform: "Elk", status: "Discovery" });
  const [creating, setCreating] = useState(false);
  const [createdMessage, setCreatedMessage] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editForm, setEditForm] = useState({ company: "", industry: "", platform: "Elk", status: "Discovery" });
  const [savingId, setSavingId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [overviewTab, setOverviewTab] = useState("workspaces");
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [members, setMembers] = useState([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [workspaceSearch, setWorkspaceSearch] = useState("");
  const [savingMemberId, setSavingMemberId] = useState("");
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviteResult, setInviteResult] = useState(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviteTemplateCopied, setInviteTemplateCopied] = useState(false);

  async function loadOverviewMembers() {
    try {
      const token = await getToken();
      const data = await apiRequest("/api/team/members", token);
      setMembers(data.members || []);
    } catch (error) {
      setStatus(error.message);
    }
  }

  useEffect(() => {
    if (isAdmin) loadOverviewMembers();
  }, [isAdmin]);

  async function sendOverviewInvite(event) {
    event.preventDefault();
    setInviteBusy(true);
    setInviteResult(null);
    setInviteCopied(false);
    setStatus("");
    try {
      const token = await getToken();
      const data = await apiRequest("/api/invite", token, {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail, role: inviteRole })
      });
      setInviteResult({
        email: inviteEmail,
        url: data.inviteUrl || "",
        emailSent: Boolean(data.emailSent),
        emailError: data.emailError || ""
      });
      setInviteEmail("");
      setInviteRole("member");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setInviteBusy(false);
    }
  }

  async function copyOverviewInviteUrl() {
    try {
      await navigator.clipboard.writeText(inviteResult?.url || "");
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  }

  async function copyInviteTemplate() {
    const senderName = user?.user_metadata?.name || user?.user_metadata?.full_name || "the Inspra team";
    const template = `Subject: Invitation to join Inspra

Hi,

I'd like to invite you to join our Inspra workspace.

Please sign in with this email address and I will confirm your workspace access from the platform.

Thanks,
${senderName}`;

    try {
      await navigator.clipboard.writeText(template);
      setInviteTemplateCopied(true);
      window.setTimeout(() => setInviteTemplateCopied(false), 2200);
    } catch {
      setStatus("Could not copy the invite template.");
      window.setTimeout(() => setStatus(""), 2200);
    }
  }

  async function changeOverviewRole(id, nextRole) {
    setSavingMemberId(id);
    setStatus("");
    try {
      const token = await getToken();
      await apiRequest(`/api/team/members/${id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ role: nextRole })
      });
      await loadOverviewMembers();
    } catch (error) {
      setStatus(error.message);
    } finally {
      setSavingMemberId("");
    }
  }

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
      openWorkspace(data.client.id);
      setForm({ company: "", industry: "", platform: "Elk", status: "Discovery" });
      setCreatedMessage(`${data.client.company} workspace created.`);
      setShowCreateWorkspace(false);
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
        setActiveTab("overview");
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

  const filteredMembers = members.filter((member) => {
    const haystack = `${member.name || ""} ${member.email || ""} ${member.role || ""}`.toLowerCase();
    return haystack.includes(memberSearch.trim().toLowerCase());
  });
  const filteredClients = clients.filter((client) => {
    const haystack = `${client.company || ""} ${client.industry || ""} ${client.platform || ""} ${client.status || ""}`.toLowerCase();
    return haystack.includes(workspaceSearch.trim().toLowerCase());
  });
  const isPickerView = viewMode === "picker";

  if (isPickerView) {
    return (
      <div className="organization-picker-screen workspace-management-screen">
        <section className="organization-picker-rail">
          <div>
            <img className="organization-picker-logo" src="/brand/inspra-wordmark.png" alt="Inspra" />
            <span className="eyebrow">Workspace selection</span>
            <h2>Welcome back, let's pick up where you left off.</h2>
            <p>Choose a workspace to enter the Inspra platform. Each workspace keeps its own agents, calls, and integrations.</p>
          </div>
          <div className="organization-rail-footer">
            <div className="organization-rail-stats">
              <span>Workspaces <strong>{clients.length} workspaces</strong></span>
              <span>Role <strong>Owner</strong></span>
              <span>Status <strong>All systems normal</strong></span>
            </div>
            <div className="organization-user-card">
              <span className="sidebar-avatar">
                {(user?.user_metadata?.name || user?.user_metadata?.full_name || user?.email || "?").slice(0, 1).toUpperCase()}
              </span>
              <span>
                <small>Signed in as</small>
                <strong>{user?.email || "Signed in"}</strong>
              </span>
            </div>
          </div>
        </section>

        <section className="organization-picker-main">
          <div className="organization-picker-toolbar">
            <label className="organization-search">
              Search workspaces
              <input
                value={workspaceSearch}
                onChange={(event) => setWorkspaceSearch(event.target.value)}
                placeholder="Find a workspace..."
              />
            </label>
            <button type="button" onClick={copyInviteTemplate}>
              {inviteTemplateCopied ? "Copied" : "Invite"}
            </button>
            <button type="button" className="primary" onClick={() => setShowCreateWorkspace(true)}>
              New workspace
            </button>
          </div>

          <div className="organization-filter-row">
            <button type="button" className="active">All {clients.length}</button>
            <button type="button">Owned {clients.length}</button>
            <button type="button">Admin {clients.length}</button>
            <button type="button">Member 0</button>
            <span>Your workspaces <strong>{clients.length}</strong></span>
          </div>

          {showCreateWorkspace && (
            <div className="modal-backdrop" role="presentation">
              <form className="create-workspace-modal" onSubmit={createClient}>
                <div className="modal-title-row">
                  <div>
                    <h2>Create Workspace</h2>
                    <p>Identify the workspace.</p>
                  </div>
                  <button type="button" className="icon-button" onClick={() => setShowCreateWorkspace(false)} aria-label="Close create workspace">
                    x
                  </button>
                </div>
                <label>
                  Workspace name
                  <input
                    id="workspace-company"
                    value={form.company}
                    onChange={(event) => setForm({ ...form, company: event.target.value })}
                    placeholder="e.g. Client Project Alpha"
                    required
                  />
                </label>
                <label>
                  Industry / description
                  <textarea
                    value={form.industry}
                    onChange={(event) => setForm({ ...form, industry: event.target.value })}
                    placeholder="Optional workspace description..."
                  />
                </label>
                <div className="form-grid">
                  <SelectInput label="Platform" value={form.platform} options={platforms} onChange={(platform) => setForm({ ...form, platform })} />
                  <SelectInput label="Status" value={form.status} options={["Discovery", "Build package", "Production QA", "Production"]} onChange={(status) => setForm({ ...form, status })} />
                </div>
                <div className="modal-actions">
                  <button type="button" onClick={() => setShowCreateWorkspace(false)}>Cancel</button>
                  <button className="primary" disabled={creating}>{creating ? "Creating..." : "Create"}</button>
                </div>
              </form>
            </div>
          )}

          <div className="organization-card-grid">
            {filteredClients.length === 0 && (
              <div className="empty">{clients.length ? "No matching workspaces." : "No workspaces yet."}</div>
            )}
            {filteredClients.map((client, index) => (
              <button
                type="button"
                className={index === 0 ? "organization-workspace-card active" : "organization-workspace-card"}
                key={client.id}
                onClick={() => openWorkspace(client.id)}
              >
                <span className="workspace-avatar">{(client.company || "?").slice(0, 2).toUpperCase()}</span>
                <strong>{client.company}</strong>
                <p>{client.industry || `${client.id} · workspace on the platform.`}</p>
                <span className="organization-card-meta">
                  <small>{client.platform || "Elk"}</small>
                  <em>Open</em>
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="workspace-stack workspace-management-screen">
      <section className="workspace-hero org-hero">
        <div>
          <span className="eyebrow">Organization management</span>
          <h2>Organization Overview</h2>
          <p>Manage your organization's workspaces, team activity, and delivery status.</p>
        </div>
        <div className="workspace-actions">
          <button
            className="primary"
            onClick={() => {
              setOverviewTab("workspaces");
              setShowCreateWorkspace(true);
              window.setTimeout(() => document.getElementById("workspace-company")?.focus(), 0);
            }}
          >
            Create workspace
          </button>
        </div>
      </section>

          <section className="metric-grid">
            <Metric label="Workspaces" value={clients.length} detail="Separate operating entities" />
            <Metric label="Team Members" value={members.length} detail="Users with workspace access" />
          </section>

      <section className="workspace-layout directory-only">
        <Panel title="Organization directory">
          <div className="directory-tabs">
            <button
              type="button"
              className={overviewTab === "workspaces" ? "active" : ""}
              onClick={() => setOverviewTab("workspaces")}
            >
              Workspaces ({clients.length})
            </button>
            <button
              type="button"
              className={overviewTab === "members" ? "active" : ""}
              onClick={() => setOverviewTab("members")}
            >
              Members ({members.length})
            </button>
          </div>
          {overviewTab === "members" && (
            <div className="overview-members">
              <div className="overview-member-toolbar">
                <label className="overview-search">
                  Search members
                  <input
                    value={memberSearch}
                    onChange={(event) => setMemberSearch(event.target.value)}
                    placeholder="Search members..."
                  />
                </label>
                {isAdmin && (
                  <button type="button" onClick={() => setShowInviteForm((current) => !current)}>
                    Invite Member
                  </button>
                )}
              </div>
              {isAdmin && showInviteForm && (
                <form className="overview-invite form-grid" onSubmit={sendOverviewInvite}>
                  <label>
                    Email address
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(event) => setInviteEmail(event.target.value)}
                      placeholder="colleague@yourcompany.com"
                      required
                    />
                  </label>
                  <label>
                    Role
                    <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value)}>
                      <option value="member">Member</option>
                      <option value="admin">Administrator</option>
                    </select>
                  </label>
                  <button className="primary wide" disabled={inviteBusy}>
                    {inviteBusy ? "Sending invitation..." : "Send invitation"}
                  </button>
                </form>
              )}
              {inviteResult && (
                <div className="notice">
                  {inviteResult.emailSent ? (
                    <strong>Invitation emailed to {inviteResult.email}.</strong>
                  ) : (
                    <strong>
                      Invite created for {inviteResult.email}.{" "}
                      {inviteResult.emailError ? `Email not sent - ${inviteResult.emailError}` : "Email is not configured."}
                    </strong>
                  )}
                  {inviteResult.url && (
                    <div className="invite-copy-row">
                      <input readOnly value={inviteResult.url} onFocus={(event) => event.target.select()} />
                      <button type="button" onClick={copyOverviewInviteUrl}>
                        {inviteCopied ? "Copied" : "Copy"}
                      </button>
                    </div>
                  )}
                </div>
              )}
              <div className="overview-section-title">
                <strong>Team Members</strong>
                <p>Organization members with their workspace access</p>
              </div>
              <div className="member-table">
                <div className="member-table-head">
                  <span>Member</span>
                  <span>Org Role</span>
                  <span>Workspaces</span>
                  <span>Joined</span>
                </div>
                {!isAdmin && <div className="empty">Team member details are available to admins.</div>}
                {isAdmin && filteredMembers.length === 0 && <div className="empty">No members found.</div>}
                {filteredMembers.map((member) => {
                  const isSelf = member.id === currentUserId;
                  const joinedAt = member.createdAt || member.created_at;
                  return (
                    <div className="member-table-row" key={member.id}>
                      <div className="member-identity">
                        <span className="member-avatar">{(member.name || member.email || "?").slice(0, 1).toUpperCase()}</span>
                        <span>
                          <strong>{member.name || member.email}{isSelf ? " (you)" : ""}</strong>
                          <p>{member.email}</p>
                        </span>
                      </div>
                      {isAdmin ? (
                        <select
                          className="role-select overview-role-select"
                          value={member.role}
                          disabled={isSelf || savingMemberId === member.id}
                          onChange={(event) => changeOverviewRole(member.id, event.target.value)}
                          title={isSelf ? "You can't change your own role" : "Change role"}
                        >
                          <option value="member">Member</option>
                          <option value="admin">Administrator</option>
                        </select>
                      ) : (
                        <span className="role-chip">{member.role}</span>
                      )}
                      <span className="workspace-chip">Workspace access</span>
                      <span className="joined-text">{joinedAt ? new Date(joinedAt).toLocaleDateString() : "Active"}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {overviewTab === "workspaces" && (
            <>
              <div className="overview-workspace-toolbar">
                <label className="overview-search">
                  Search workspaces
                  <input
                    value={workspaceSearch}
                    onChange={(event) => setWorkspaceSearch(event.target.value)}
                    placeholder="Search workspaces..."
                  />
                </label>
                <button type="button" className="primary" onClick={() => setShowCreateWorkspace(true)}>
                  Create workspace
                </button>
              </div>
              {showCreateWorkspace && (
                <div className="modal-backdrop" role="presentation">
                  <form className="create-workspace-modal" onSubmit={createClient}>
                    <div className="modal-title-row">
                      <div>
                        <h2>Create Workspace</h2>
                        <p>Identify the workspace.</p>
                      </div>
                      <button type="button" className="icon-button" onClick={() => setShowCreateWorkspace(false)} aria-label="Close create workspace">
                        x
                      </button>
                    </div>
                    <label>
                      Workspace name
                      <input
                        id="workspace-company"
                        value={form.company}
                        onChange={(event) => setForm({ ...form, company: event.target.value })}
                        placeholder="e.g. Client Project Alpha"
                        required
                      />
                    </label>
                    <label>
                      Industry / description
                      <textarea
                        value={form.industry}
                        onChange={(event) => setForm({ ...form, industry: event.target.value })}
                        placeholder="Optional workspace description..."
                      />
                    </label>
                    <div className="form-grid">
                      <SelectInput label="Platform" value={form.platform} options={platforms} onChange={(platform) => setForm({ ...form, platform })} />
                      <SelectInput label="Status" value={form.status} options={["Discovery", "Build package", "Production QA", "Production"]} onChange={(status) => setForm({ ...form, status })} />
                    </div>
                    <div className="modal-actions">
                      <button type="button" onClick={() => setShowCreateWorkspace(false)}>Cancel</button>
                      <button className="primary" disabled={creating}>{creating ? "Creating..." : "Create"}</button>
                    </div>
                  </form>
                </div>
              )}
              {createdMessage && <div className="notice success">{createdMessage}</div>}
              <div className="overview-section-title">
                <strong>Workspaces</strong>
                <p>All workspaces in your organization</p>
              </div>
              <div className="workspace-list">
                <List
                  items={filteredClients}
                  empty={clients.length ? "No matching workspaces." : "No workspaces yet."}
                  render={(client) => (
                    <div className="workspace-record">
                      <button
                        className={client.id === selectedClientId ? "workspace-row active" : "workspace-row"}
                        onClick={() => openWorkspace(client.id)}
                      >
                        <span className="workspace-chevron">›</span>
                        <span className="workspace-avatar">{(client.company || "?").slice(0, 2).toUpperCase()}</span>
                        <span>
                          <strong>{client.company}</strong>
                          <p>{client.id}</p>
                        </span>
                        <span className="status-chip">{client.status || "Active"}</span>
                        <em>{client.platform || "Elk"}</em>
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
            </>
          )}
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

            <PromptBox
              value={promptDraft}
              editable
              onChange={(nextValue) => {
                setPromptDraft(nextValue);
                setCopyStatus("");
              }}
              placeholder="Paste the full agent prompt here."
              required
            />

            <div className="prompt-editor-actions">
              <button className="primary" disabled={saving || !promptDraft.trim()}>
                {saving ? "Saving..." : sortedVersions.length ? "Update prompt" : "Save prompt"}
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
    <section className="studio-stack">
      <Panel title="Prompt revision">
        <form className="form-grid" onSubmit={optimizePrompt}>
          <div className="wide">
            <BrainPanel form={form} setForm={setForm} />
          </div>
          <div className="wide prompt-input-field">
            <span className="field-label-text">Current prompt</span>
            <PromptBox
              value={form.previousPrompt}
              editable
              onChange={(previousPrompt) => setForm({ ...form, previousPrompt })}
              placeholder="Paste the current prompt here."
              minLines={14}
            />
          </div>
          <label className="wide">
            Notes
            <textarea value={form.clientFeedback} onChange={(event) => setForm({ ...form, clientFeedback: event.target.value })} placeholder="Paste feedback, call notes, objections, or review notes here." />
          </label>
          <div className="wide">
            <SourceFilesInput value={form.attachments} onChange={(attachments) => setForm({ ...form, attachments })} />
          </div>
          <SelectInput label="Revision goal" value={form.optimizationTarget} options={["Improve overall quality", "Shorter responses", "Clearer call flow", "Stronger guardrails", "Lower latency"]} onChange={(optimizationTarget) => setForm({ ...form, optimizationTarget })} />
          <button className="primary wide">{busy ? "Creating..." : "Create revision"}</button>
        </form>
      </Panel>
      {promptOutput && <PromptOutput job={promptOutput} mode="elk" title="Elk builder output" />}
      {promptOutput && <PromptLifecyclePanel job={promptOutput} />}
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
    <section className="studio-stack">
      <Panel title="Create build package">
        <form className="form-grid" onSubmit={generatePrompt}>
          <div className="wide">
            <BrainPanel form={form} setForm={setForm} />
          </div>
          <SelectInput label="Agent type" value={form.agentType} options={agentTypes} onChange={(agentType) => setForm({ ...form, agentType })} />
          <TextInput label="Industry" value={form.industry} onChange={(industry) => setForm({ ...form, industry })} />
          <SelectInput label="Platform" value={form.platform} options={platforms} onChange={(platform) => setForm({ ...form, platform })} />
          <label className="wide">
            Information
            <textarea value={form.sourceBrief} onChange={(event) => setForm({ ...form, sourceBrief: event.target.value })} />
          </label>
          <div className="wide">
            <SourceFilesInput value={form.attachments} onChange={(attachments) => setForm({ ...form, attachments })} />
          </div>
          <button className="primary wide">{busy ? "Creating..." : "Create package"}</button>
        </form>
      </Panel>
      {promptOutput && <PromptOutput job={promptOutput} mode="prompt" title="Prompt output" />}
      {promptOutput && <PromptLifecyclePanel job={promptOutput} />}
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
    <section className="studio-stack">
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
            Information
            <textarea value={form.sourceBrief} onChange={(event) => setForm({ ...form, sourceBrief: event.target.value })} placeholder="Paste transcript, notes, or requirements here." required />
          </label>
          <div className="wide">
            <SourceFilesInput value={form.attachments} onChange={(attachments) => setForm({ ...form, attachments })} />
          </div>
          <button className="primary wide">{busy ? "Creating docs..." : "Create docs"}</button>
        </form>
      </Panel>
      {promptOutput && <PromptOutput job={promptOutput} mode="docs" title="Docs output" showPrompt={false} />}
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
    if (file.size > MAX_ATTACHMENT_BYTES) {
      throw new Error(`${file.name} is larger than ${MAX_ATTACHMENT_MB} MB.`);
    }

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
    } catch (error) {
      setFileStatus(error.message || "Could not read one of the files.");
    }
  }

  return (
    <label className="file-input">
      Attach source files
      <input type="file" multiple accept=".txt,.md,.csv,.json,.xml,.yaml,.yml,.pdf,.doc,.docx,image/*" onChange={handleFiles} />
      <span>{fileStatus || (value.length ? `${value.length} file${value.length === 1 ? "" : "s"} attached.` : `Add docs, PDFs, images, or notes as source input. Max ${MAX_ATTACHMENT_MB} MB per file.`)}</span>
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
        <SelectInput label="Provider" help="The service used to run the selected AI model." value={form.llmProvider} options={llmProviders} onChange={(llmProvider) => setForm({ ...form, llmProvider })} />
        <SelectInput label="Model" help="The AI model used to draft the prompt and documents." value={form.llmModel} options={llmModels} onChange={(llmModel) => setForm({ ...form, llmModel })} />
        <TextInput label="Temperature" help="Controls variation. Lower is more consistent; higher is more creative." value={form.temperature || "0.4"} onChange={(temperature) => setForm({ ...form, temperature })} />
        <TextInput label="Token limit" help="Maximum response length the model can generate." value={form.maxTokens || "4000"} onChange={(maxTokens) => setForm({ ...form, maxTokens })} />
        <SelectInput label="Reasoning" help="How much effort the model spends planning before writing." value={form.reasoningMode || "Balanced"} options={["Fast", "Balanced", "Deep"]} onChange={(reasoningMode) => setForm({ ...form, reasoningMode })} />
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

function buildDocumentDownloadFilename(job, title, extension = "pdf") {
  const client = typeof job === "object" ? job?.client : "";
  const safeClient = String(client || "inspra-docs")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const safeTitle = String(title || "document")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return `${safeClient || "inspra-docs"}-${safeTitle || "document"}.${extension}`;
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

function addPdfRoundRect(commands, x, y, width, height, radius, fill, stroke = "#DDDDDD", lineWidth = 1) {
  const c = radius * 0.5522847498;
  const x2 = x + width;
  const y2 = y + height;
  commands.push(
    `${pdfColor(fill)} rg`,
    `${pdfColor(stroke)} RG`,
    `${lineWidth} w`,
    `${x + radius} ${y} m`,
    `${x2 - radius} ${y} l`,
    `${x2 - radius + c} ${y} ${x2} ${y + radius - c} ${x2} ${y + radius} c`,
    `${x2} ${y2 - radius} l`,
    `${x2} ${y2 - radius + c} ${x2 - radius + c} ${y2} ${x2 - radius} ${y2} c`,
    `${x + radius} ${y2} l`,
    `${x + radius - c} ${y2} ${x} ${y2 - radius + c} ${x} ${y2 - radius} c`,
    `${x} ${y + radius} l`,
    `${x} ${y + radius - c} ${x + radius - c} ${y} ${x + radius} ${y} c`,
    "B"
  );
}

function addPdfLine(commands, x1, y1, x2, y2, color = "#555555", lineWidth = 1) {
  commands.push(`${pdfColor(color)} RG`, `${lineWidth} w`, `${x1} ${y1} m ${x2} ${y2} l S`);
}

function addWrappedPdfText(commands, text, x, y, maxChars, lineHeight, size, color) {
  wrapPdfLine(text, maxChars).slice(0, 3).forEach((line, index) => {
    addPdfText(commands, line, x, y - index * lineHeight, size, color);
  });
}

function addPdfPageNumber(commands, pageWidth, pageNumber, pageCount, footerText = "Confidential client blueprint") {
  addPdfLine(commands, 34, 52, pageWidth - 34, 52, "#DDDDDD", 0.8);
  addPdfText(commands, "Inspra AI", 44, 34, 7.5, "#777777");
  addPdfText(commands, footerText, pageWidth / 2 - 70, 34, 7.5, "#777777");
  addPdfText(commands, `${pageNumber} of ${pageCount}`, pageWidth - 82, 34, 7.5, "#777777");
}

function splitContentSections(value) {
  const sections = [];
  const lines = String(value || "").split(/\r?\n/);
  let current = null;

  lines.forEach((line) => {
    const heading = line.match(/^#{1,3}\s+(.+)/);
    if (heading) {
      current = { title: heading[1].trim(), body: [] };
      sections.push(current);
      return;
    }
    if (current) current.body.push(line);
  });

  return sections.map((section) => ({
    title: section.title,
    body: section.body.join("\n").trim()
  }));
}

function getSectionText(sections, pattern, fallback = "") {
  const match = sections.find((section) => pattern.test(section.title));
  return match?.body || fallback;
}

function extractPlainLines(value, maxLines = 12) {
  return stripMarkdown(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, maxLines);
}

function drawSystemBox(commands, box) {
  addPdfRect(commands, box.x, box.y, box.w, box.h, box.fill, box.stroke, 1.1);
  addWrappedPdfText(commands, box.title, box.x + 8, box.y + box.h - 15, 18, 10, 8.4, "#1A1A1A");
  if (box.subtitle) {
    addWrappedPdfText(commands, box.subtitle, box.x + 8, box.y + 14, 21, 8, 6.7, "#777777");
  }
}

function drawSwimlaneDiagram(commands, title) {
  const pageWidth = 1238;
  const pageHeight = 807;
  const brand = "#39E100";
  const brandDark = "#1A3A00";
  const rowX = 28;
  const rowW = pageWidth - 56;
  const rowH = 90;
  const labelW = 52;
  const boxW = 118;
  const boxH = 50;
  const rows = [
    {
      label: "CURRENT\nSETUP",
      y: 572,
      fill: "#EEF2FF",
      stroke: "#7090CC",
      boxes: [
        ["Source Notes", "Approved client inputs", "Discovery material", "#E8F0FE", "#4A6FA5"],
        ["CRM / Pipeline", "Existing account", "System of record", "#E8F0FE", "#4A6FA5"],
        ["Current Bot", "Follow-up flow", "Clean before restart", "#E8F0FE", "#4A6FA5"],
        ["Primary Owner", "Review user", "Owns outcomes", "#F0F0F0", "#888888"],
        ["Display Number", "Caller ID", "Decision needed", "#E8F0FE", "#4A6FA5", 1],
        ["Manual Notes", "Email follow-up", "Existing pattern", "#E8F0FE", "#4A6FA5"]
      ]
    },
    {
      label: "PHASE 1\nLOCAL",
      y: 412,
      fill: "#EDFCE5",
      stroke: brand,
      boxes: [
        ["New Leads", "Website / forms", "Local lead pool", "#E8F0FE", "#4A6FA5"],
        ["Workflow Trigger", "Pipeline entry", "Call in approved window", "#F3EEFF", "#7B2FBE"],
        ["AI Voice Agent", "Qualify intent", "Approved questions", "#E8FAE0", brand],
        ["Intent Filter", "Interested vs low", "Reduce inbox noise", "#F3EEFF", "#7B2FBE"],
        ["CRM Notes", "Task or outcome", "Structured record", "#F3EEFF", "#7B2FBE"],
        ["Owner Email", "Only intent leads", "Actionable summary", "#E8FAE0", "#2D8A2D"]
      ]
    },
    {
      label: "PHASE 2\nEVENTS",
      y: 250,
      fill: "#FFF8EE",
      stroke: "#E07000",
      boxes: [
        ["Campaign Lead", "Meta / website", "Event registrations", "#E8F0FE", "#4A6FA5"],
        ["Country Pipeline", "Market route", "AU / SG / MY / PH", "#F3EEFF", "#7B2FBE"],
        ["Time Window", "Local call rules", "Avoid poor timing", "#F3EEFF", "#7B2FBE", 2],
        ["Buyer Bot", "Project script", "Confirm and qualify", "#E8FAE0", brand],
        ["Event Notes", "Attendance intent", "CRM plus email", "#F3EEFF", "#7B2FBE"],
        ["Final Call", "Human follow-up", "Qualified prospects", "#E8FAE0", "#2D8A2D"]
      ]
    },
    {
      label: "FUTURE\nTBC",
      y: 112,
      fill: "#F7F7F7",
      stroke: "#888888",
      boxes: [
        ["Channel Check", "WhatsApp / SMS", "Missed-call path", "#FFF3E0", "#E07000", 3],
        ["Voice Notes", "Async follow-up", "If compliant", "#FFF3E0", "#E07000"],
        ["Multi Numbers", "Country numbers", "Improve answer rate", "#FFF3E0", "#E07000"],
        ["Usage Reporting", "Connected calls", "Cost and quality", "#F3EEFF", "#7B2FBE"],
        ["Optimisation", "Script and timing", "Review recordings", "#E8FAE0", brand]
      ]
    }
  ];

  const cleanTitle = title === "Blueprint" ? "AI Voice Agent Workflow Blueprint" : title;
  addPdfRoundRect(commands, 10, 10, pageWidth - 20, pageHeight - 20, 18, "#FFFFFF", "#DDDDDD", 1);
  addPdfText(commands, "iNSPRA", 42, 742, 24, brandDark);
  addPdfText(commands, cleanTitle, pageWidth / 2 - 165, 760, 16, "#1A1A1A");
  addPdfText(commands, "Inspra AI | v1", pageWidth / 2 - 28, 740, 8.5, "#777777");

  const legend = [
    ["Existing System", "#E8F0FE", "#4A6FA5"],
    ["New / Central Hub", "#F3EEFF", "#7B2FBE"],
    ["Inspra AI System", "#E8FAE0", brand],
    ["Future / TBC", "#FFF3E0", "#E07000"],
    ["Qualified Outcome", "#E8FAE8", "#2D8A2D"]
  ];
  legend.forEach(([label, fill, stroke], index) => {
    const x = 138 + index * 198;
    addPdfRoundRect(commands, x, 704, 28, 19, 4, fill, stroke, 1.2);
    addPdfText(commands, label, x + 38, 710, 7.2, "#444444");
  });
  addPdfRoundRect(commands, 1130, 700, 24, 24, 12, "#FF6B00", "#FF6B00", 1);
  addPdfText(commands, "Q", 1137, 708, 7, "#FFFFFF");
  addPdfText(commands, "Open Question", 1160, 708, 7.2, "#444444");
  addPdfLine(commands, 28, 690, pageWidth - 28, 690, "#DDDDDD", 0.8);

  rows.forEach((row) => {
    addPdfRoundRect(commands, rowX, row.y, rowW, rowH, 12, row.fill, row.stroke, 1.3);
    addPdfRoundRect(commands, rowX + 14, row.y + 24, labelW, 42, 4, row.fill, row.stroke, 1.1);
    addWrappedPdfText(commands, row.label, rowX + 24, row.y + 52, 10, 9, 6.8, row.stroke);

    const laneX = rowX + labelW + 58;
    const laneW = rowW - labelW - 92;
    const gap = (laneW - row.boxes.length * boxW) / Math.max(1, row.boxes.length - 1);
    const boxY = row.y + 25;
    const placed = row.boxes.map((box, index) => ({
      x: laneX + index * (boxW + gap),
      y: boxY,
      w: boxW,
      h: boxH,
      title: box[0],
      subtitle: box[1],
      note: box[2],
      fill: box[3],
      stroke: box[4],
      badge: box[5]
    }));

    placed.forEach((box, index) => {
      addPdfRoundRect(commands, box.x, box.y, box.w, box.h, 7, box.fill, box.stroke, 1.2);
      addWrappedPdfText(commands, box.title, box.x + 12, box.y + box.h - 14, 18, 10, 7.8, "#1A1A1A");
      addWrappedPdfText(commands, box.subtitle, box.x + 12, box.y + 25, 20, 8, 6.7, "#333333");
      addWrappedPdfText(commands, box.note, box.x + 12, box.y + 9, 22, 7, 5.8, "#777777");
      if (box.badge) {
        addPdfRoundRect(commands, box.x + box.w - 20, box.y + box.h - 12, 24, 24, 12, "#FF6B00", "#FF6B00", 1);
        addPdfText(commands, String(box.badge), box.x + box.w - 12, box.y + box.h - 4, 7, "#FFFFFF");
      }
      if (index < placed.length - 1) {
        const startX = box.x + box.w + 6;
        const endX = placed[index + 1].x - 6;
        const y = box.y + box.h / 2;
        addPdfLine(commands, startX, y, endX, y, row.stroke, 1);
        addPdfText(commands, ">", endX - 3, y - 3, 8, "#555555");
      }
    });
  });

  addPdfLine(commands, 28, 212, pageWidth - 28, 212, "#DDDDDD", 0.7);
  addPdfLine(commands, 28, 328, pageWidth - 28, 328, "#DDDDDD", 0.7);
  addPdfLine(commands, 28, 492, pageWidth - 28, 492, "#DDDDDD", 0.7);
  addPdfLine(commands, 515, 622, 515, 437, "#2D8A2D", 1);
  addPdfText(commands, "v", 511, 432, 8, "#2D8A2D");
  addPdfLine(commands, 706, 437, 706, 300, "#E07000", 1);
  addPdfText(commands, "v", 702, 294, 8, "#E07000");
  addPdfLine(commands, 890, 250, 890, 143, "#888888", 1);
  addPdfText(commands, "v", 886, 138, 8, "#888888");

  addPdfText(commands, "Open Questions", 44, 88, 9, "#1A1A1A");
  [
    "Confirm display number or dedicated bot number.",
    "Confirm calendar routing and booking owner.",
    "Confirm missed-call or voice-note feasibility."
  ].forEach((question, index) => {
    const x = 150 + index * 360;
    addPdfRoundRect(commands, x, 62, 23, 23, 12, "#FF6B00", "#FF6B00", 1);
    addPdfText(commands, String(index + 1), x + 8, 70, 7, "#FFFFFF");
    addWrappedPdfText(commands, question, x + 32, 76, 56, 10, 7.3, "#444444");
  });

  addPdfPageNumber(commands, pageWidth, 1, 1, "Inspra AI - Confidential");
}

function drawCallFlowDiagram(commands, title, value) {
  const pageWidth = 842;
  const brand = "#39E100";
  const steps = extractPlainLines(value, 10).slice(0, 7);
  const flowSteps = steps.length ? steps : [
    "Greeting and consent",
    "Identify caller intent",
    "Collect required details",
    "Branch to booking, callback, question, transfer, or refusal",
    "Complete the action",
    "Confirm only after success",
    "Close the call"
  ];

  addPdfText(commands, "INSPRA AI", 36, 548, 15, "#1A3A00");
  addPdfText(commands, title, 292, 550, 14, "#1A1A1A");
  addPdfText(commands, "Call Flow | Decision and routing logic | v1", 322, 532, 8.5, "#777777");
  addPdfLine(commands, 34, 515, pageWidth - 34, 515, "#DDDDDD", 0.8);

  const startX = 54;
  const boxW = 96;
  const boxH = 52;
  const gap = 16;
  flowSteps.forEach((step, index) => {
    const x = startX + index * (boxW + gap);
    const fill = index === 0 ? "#F0F0F0" : index === flowSteps.length - 1 ? "#E8FAE0" : "#F3EEFF";
    const stroke = index === 0 ? "#888888" : index === flowSteps.length - 1 ? brand : "#7B2FBE";
    addPdfRect(commands, x, 345, boxW, boxH, fill, stroke, 1.2);
    addWrappedPdfText(commands, step, x + 9, 382, 15, 10, 7.4, "#1A1A1A");
    if (index < flowSteps.length - 1) {
      addPdfLine(commands, x + boxW + 4, 371, x + boxW + gap - 4, 371, "#555555", 1);
      addPdfText(commands, ">", x + boxW + gap - 9, 367, 8, "#555555");
    }
  });

  const branches = [
    ["Booking", "Check availability, present slots, book, then confirm."],
    ["Question", "Answer only from approved knowledge, then continue."],
    ["Callback", "Capture name, phone, preferred date, preferred time, and notes."],
    ["Restricted", "Decline safely and offer human follow-up."],
    ["No answer", "Log outcome and apply approved retry or nurture rule."]
  ];
  addPdfText(commands, "Routing Branches", 54, 270, 11, "#1A1A1A");
  branches.forEach(([label, body], index) => {
    const x = 54 + (index % 3) * 250;
    const y = index < 3 ? 222 : 142;
    addPdfRect(commands, x, y, 210, 46, "#FFF8EE", "#E07000", 1);
    addPdfText(commands, label, x + 12, y + 29, 8.6, "#1A1A1A");
    addWrappedPdfText(commands, body, x + 12, y + 17, 29, 8, 6.8, "#444444");
  });

  addPdfPageNumber(commands, pageWidth, 1, 1, "Call flow approval document");
}

function drawIntegrationDiagram(commands, title, value) {
  const pageWidth = 842;
  const brand = "#39E100";
  const boxes = [
    ["Voice platform", "Call session and transcript", "#F3EEFF", "#7B2FBE"],
    ["AI agent", "Approved script and logic", "#E8FAE0", brand],
    ["Tool router", "Booking/callback action", "#F3EEFF", "#7B2FBE"],
    ["Automation layer", "Validation and retries", "#FFF3E0", "#E07000"],
    ["CRM / calendar", "Records and appointments", "#E8F0FE", "#4A6FA5"],
    ["Notifications", "Owner alerts and summaries", "#F0F0F0", "#888888"]
  ];

  addPdfText(commands, "INSPRA AI", 36, 548, 15, "#1A3A00");
  addPdfText(commands, title, 266, 550, 14, "#1A1A1A");
  addPdfText(commands, "Integration Blueprint | Systems, ownership, and failure paths | v1", 255, 532, 8.5, "#777777");
  addPdfLine(commands, 34, 515, pageWidth - 34, 515, "#DDDDDD", 0.8);

  boxes.forEach(([label, body, fill, stroke], index) => {
    const x = 58 + index * 126;
    addPdfRect(commands, x, 360, 106, 54, fill, stroke, 1.2);
    addPdfText(commands, label, x + 10, 395, 8.2, "#1A1A1A");
    addWrappedPdfText(commands, body, x + 10, 381, 16, 8, 6.8, "#555555");
    if (index < boxes.length - 1) {
      addPdfLine(commands, x + 110, 386, x + 122, 386, "#555555", 1);
      addPdfText(commands, ">", x + 118, 382, 8, "#555555");
    }
  });

  addPdfText(commands, "Ownership and Failure Handling", 58, 290, 11, "#1A1A1A");
  extractPlainLines(value, 10).slice(0, 8).forEach((line, index) => {
    const y = 260 - index * 22;
    addPdfRect(commands, 58, y - 5, 18, 18, index % 2 ? "#F3EEFF" : "#EDFCE5", index % 2 ? "#7B2FBE" : brand, 0.8);
    addPdfText(commands, String(index + 1), 64, y + 1, 7, "#1A1A1A");
    addWrappedPdfText(commands, line, 86, y + 5, 82, 9, 7.5, "#333333");
  });

  addPdfPageNumber(commands, pageWidth, 1, 1, "Integration blueprint approval document");
}

function drawScriptDocument(commands, title, value) {
  const pageWidth = 842;
  const pageHeight = 595;
  const margin = 48;
  addPdfRect(commands, margin, pageHeight - 94, pageWidth - margin * 2, 54, "#F7FBF8", "#1A3A00", 1.4);
  addPdfText(commands, "INSPRA AI", margin + 18, pageHeight - 64, 13, "#1A3A00");
  addPdfText(commands, title, margin + 150, pageHeight - 64, 16, "#1A1A1A");
  addPdfText(commands, "Production call script | Spoken conversation copy", margin + 150, pageHeight - 82, 9, "#777777");

  const sections = splitContentSections(value);
  const scriptSections = sections.length ? sections : [
    { title: "Opening", body: value },
    { title: "Qualification", body: "" },
    { title: "Objections", body: "" },
    { title: "Close", body: "" }
  ];
  let y = pageHeight - 135;
  scriptSections.slice(0, 5).forEach((section) => {
    addPdfText(commands, section.title, margin, y, 11, "#1A1A1A");
    const lines = stripMarkdown(section.body)
      .split(/\r?\n/)
      .flatMap((line) => wrapPdfLine(line.trim(), 82))
      .filter(Boolean)
      .slice(0, 5);
    lines.forEach((line, index) => addPdfText(commands, line, margin, y - 18 - index * 12, 8.4, "#333333"));
    y -= 88;
  });
  addPdfPageNumber(commands, pageWidth, 1, 1, "Call script approval document");
}

function createDiagramPdf(title, artifactItems) {
  const margin = 48;
  const sections = artifactItems.filter((item) => item.value);
  const pages = sections.flatMap((item) => {
    if (item.diagram) {
      const wideDiagram = item.type === "diagram";
      return [
        {
          title: item.title,
          subtitle: item.type === "call-flow" ? "Decision and routing logic" : item.type === "integration" ? "Systems and handoff map" : "Workflow blueprint",
          value: item.value,
          body: [],
          visual: item.type || "swimlane",
          pageWidth: wideDiagram ? 1238 : 842,
          pageHeight: wideDiagram ? 807 : 595
        }
      ];
    }

    return [
      {
      title: item.title,
      subtitle: item.type === "writeup" ? "Client write-up" : "Production document",
      body: stripMarkdown(item.value)
        .split(/\r?\n/)
        .flatMap((line) => wrapPdfLine(line.trim(), 78))
        .filter(Boolean)
        .slice(0, 42),
        visual: "writeup",
        pageWidth: 842,
        pageHeight: 595
      }
    ];
  });

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
    const pageWidth = page.pageWidth || 842;
    const pageHeight = page.pageHeight || 595;
    const commands = [`${pdfColor("#FFFFFF")} rg`, `0 0 ${pageWidth} ${pageHeight} re f`];

    if (page.visual === "diagram") {
      drawSwimlaneDiagram(commands, page.title);
    } else if (page.visual === "call-flow") {
      drawCallFlowDiagram(commands, page.title, page.value);
    } else if (page.visual === "integration") {
      drawIntegrationDiagram(commands, page.title, page.value);
    } else if (page.visual === "script") {
      drawScriptDocument(commands, page.title, page.value);
    } else {
      addPdfRect(commands, margin, pageHeight - 94, pageWidth - margin * 2, 54, "#F7FBF8", "#1A3A00", 1.4);
      addPdfText(commands, "INSPRA AI", margin + 18, pageHeight - 64, 13, "#1A3A00");
      addPdfText(commands, page.title, margin + 150, pageHeight - 64, 16, "#1A1A1A");
      addPdfText(commands, page.subtitle, margin + 150, pageHeight - 82, 9, "#777777");
      addPdfRect(commands, margin, pageHeight - 160, pageWidth - margin * 2, 42, "#EDFCE5", "#39E100", 1);
      addPdfText(commands, page.title, margin + 16, pageHeight - 135, 11, "#1A3A00");

      const startY = pageHeight - 195;
      page.body.forEach((line, index) => {
        addPdfText(commands, line, margin, startY - index * 13, 9, "#1A1A1A");
      });
    }
    if (page.visual === "writeup") {
      addPdfText(commands, `${pageIndex + 1} of ${pages.length}`, pageWidth - margin - 34, 30, 8, "#777777");
    }
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

function createClientWriteupPdf(job, item) {
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 58;
  const client = typeof job === "object" && job?.client ? job.client : "Default workspace";
  const today = new Date().toLocaleDateString("en-AU", { day: "2-digit", month: "long", year: "numeric" });
  const sections = splitContentSections(item.value);
  const context = getSectionText(sections, /context/i, "This document summarises the proposed AI voice-agent workflow for client review and approval.");
  const executive = getSectionText(sections, /executive summary/i, "The recommended approach is to confirm the operating flow, ownership points, handoffs, exceptions, and next steps before implementation.");
  const current = getSectionText(sections, /current situation/i, "The current workflow should be reviewed against the source notes, existing systems, manual handoffs, and approval requirements.");
  const recommended = getSectionText(sections, /recommended approach/i, "Use the accompanying blueprint to confirm the operating flow, system ownership, exception handling, and release path.");
  const walkthrough = getSectionText(sections, /diagram walkthrough/i, "The accompanying blueprint shows the current state, proposed implementation path, monitored operation, and open questions for approval.");
  const implementation = getSectionText(sections, /implementation plan/i, "Confirm source systems and required fields. Confirm the approval owner. Test the happy path, callback path, exception path, and failure path. Approve the document before production release.");
  const nextSteps = getSectionText(sections, /next steps/i, "Review the blueprint and write-up together. Confirm missing data, access, or ownership details. Approve the final workflow for build or release.");
  const summaryLines = extractPlainLines(`${context}\n${recommended}\n${walkthrough}`, 8);

  const pages = [
    {
      kind: "title",
      title: `${client} x Inspra AI`,
      subtitle: item.title.replace(/\bwrite-up\b/i, "Blueprint Write-up"),
      fields: [
        ["Client", client],
        ["Prepared by", "Inspra AI"],
        ["Date", today],
        ["Version", "v1"]
      ]
    },
    {
      kind: "text",
      title: "Context",
      sections: [
        ["Context", context],
        ["Executive Summary", executive],
        ["Current Situation", current]
      ]
    },
    {
      kind: "text",
      title: "Recommended Approach",
      sections: [
        ["Recommended Approach", recommended],
        ["Diagram Walkthrough", walkthrough],
        ["Summary Table", summaryLines.map((line, index) => `${index + 1}. ${line}`).join("\n")]
      ]
    },
    {
      kind: "text",
      title: "Implementation Plan",
      sections: [
        ["Implementation Plan", implementation],
        ["Investment & Returns", "No investment or return figures are included unless they were discussed and confirmed in the source material."],
        ["Next Steps", nextSteps]
      ]
    }
  ];

  const objects = [];
  const addObject = (body) => {
    objects.push(body);
    return objects.length;
  };

  const catalogId = addObject("<< /Type /Catalog /Pages 2 0 R >>");
  const pagesId = addObject("");
  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const boldFontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const pageRefs = [];

  function addHeader(commands, page) {
    addPdfText(commands, "INSPRA AI", margin, pageHeight - 50, 13, "#1A3A00");
    addPdfLine(commands, margin, pageHeight - 65, pageWidth - margin, pageHeight - 65, "#39E100", 1.5);
    if (page.kind !== "title") addPdfText(commands, page.title, margin, pageHeight - 88, 14, "#1A1A1A");
  }

  function addParagraph(commands, text, x, startY, maxChars, size = 9, lineHeight = 13, maxLines = 18) {
    const lines = stripMarkdown(text)
      .split(/\r?\n/)
      .flatMap((line) => wrapPdfLine(line.trim(), maxChars))
      .filter(Boolean)
      .slice(0, maxLines);
    lines.forEach((line, index) => addPdfText(commands, line, x, startY - index * lineHeight, size, "#333333"));
    return startY - lines.length * lineHeight;
  }

  pages.forEach((page, pageIndex) => {
    const commands = [`${pdfColor("#FFFFFF")} rg`, `0 0 ${pageWidth} ${pageHeight} re f`];
    addHeader(commands, page);

    if (page.kind === "title") {
      addPdfText(commands, page.title, margin, pageHeight - 160, 22, "#1A1A1A");
      addPdfText(commands, page.subtitle, margin, pageHeight - 184, 12, "#555555");
      addPdfRect(commands, margin, pageHeight - 330, pageWidth - margin * 2, 112, "#F7FBF8", "#39E100", 1);
      addPdfText(commands, "Field", margin + 18, pageHeight - 244, 9, "#1A3A00");
      addPdfText(commands, "Value", margin + 150, pageHeight - 244, 9, "#1A3A00");
      page.fields.forEach(([label, value], index) => {
        const y = pageHeight - 270 - index * 22;
        addPdfText(commands, label, margin + 18, y, 8.5, "#444444");
        addPdfText(commands, value, margin + 150, y, 8.5, "#1A1A1A");
      });
    } else {
      let y = pageHeight - 122;
      page.sections.forEach(([heading, body]) => {
        addPdfText(commands, heading, margin, y, 13, "#1A1A1A");
        y = addParagraph(commands, body, margin, y - 20, 74, 9, 13, heading === "Summary Table" ? 9 : 11) - 14;
      });
    }

    addPdfPageNumber(commands, pageWidth, pageIndex + 1, pages.length, `${client} x Inspra AI - Confidential`);
    const stream = commands.join("\n");
    const contentId = addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
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

function downloadDocPdf(job, item) {
  if (!item?.value) return;

  const client = typeof job === "object" && job?.client ? job.client : "Inspra";
  const title = `${client} - ${item.title}`;
  const pdf = item.type === "writeup" ? createClientWriteupPdf(job, item) : createDiagramPdf(title, [item]);
  const blob = new Blob([pdf], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = buildDocumentDownloadFilename(job, item.title, "pdf");
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function getArtifactItems(job, mode) {
  const docs = expandDocsWithWriteups([
    { title: "Blueprint", value: job?.blueprint, diagram: true, type: "diagram" },
    { title: "Call script", value: job?.callScript || job?.salesScript, diagram: true, type: "script" },
    { title: "Call flow", value: job?.callFlowChart, diagram: true, type: "call-flow" },
    { title: "Integration blueprint", value: job?.integrationBlueprint || job?.integrationFlowchart, diagram: true, type: "integration" }
  ]);
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

function expandDocsWithWriteups(items) {
  return items.flatMap((item) => {
    if (!item.diagram || !item.value || item.type === "script") return [item];
    return [
      item,
      {
        title: `${item.title} write-up`,
        value: buildArtifactWriteup(item),
        type: "writeup"
      }
    ];
  });
}

function buildArtifactWriteup(item) {
  const content = stripMarkdown(item.value);
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12);
  const summary = lines.slice(0, 3).join(" ");
  const currentSituation = lines.slice(3, 7).map((line) => `- ${line}`).join("\n");
  const walkthrough = lines.slice(7, 11).map((line) => `- ${line}`).join("\n");

  return `# ${item.title} Write-up

## Context
${summary || "This document summarises the proposed workflow for client review and approval."}

## Executive Summary
The recommended approach is to use the accompanying ${item.title.toLowerCase()} as the approval reference before implementation. It should confirm the operating flow, system ownership, handoffs, exceptions, and next steps in plain business language.

## Current Situation
${currentSituation || "- Confirm the source systems currently used by the client.\n- Confirm where calls, bookings, notes, callbacks, and notifications are handled today.\n- Confirm any manual review points or approval dependencies before build work starts."}

## Recommended Approach
Use the accompanying ${item.title.toLowerCase()} to confirm the operating flow, ownership points, handoffs, exceptions, and next steps before implementation. The document should be reviewed as a client approval artefact, not as internal implementation notes.

## Walkthrough
${walkthrough || "- Review the workflow from first client input through final handoff.\n- Confirm the systems that create, update, and receive records.\n- Confirm the owner for approvals, exceptions, and follow-up tasks."}

## Diagram Walkthrough
The companion blueprint should show the current state, proposed implementation path, monitored operation, and open questions. Use the diagram to confirm the flow visually before approving production work.

## Summary Table
| Component | Role | Impact |
|---|---|---|
| Source systems | Provide leads, bookings, notes, and client context | Confirms where information starts |
| AI voice agent | Handles approved call flow and qualification | Creates consistent client conversations |
| Tool or workflow layer | Routes bookings, callbacks, notes, and notifications | Reduces manual follow-up gaps |
| CRM or calendar | Stores outcomes and next actions | Keeps the team aligned |
| Approval owner | Reviews exceptions and release readiness | Prevents unapproved production changes |

## Implementation Plan
1. Confirm the source systems and required fields.
2. Confirm the approval owner for workflow changes.
3. Test the happy path, callback path, exception path, and failure path.
4. Approve the document before production release.

## Investment & Returns
No investment or return figures are included unless they were discussed and confirmed in the source material.

## Next Steps
- Review the diagram and this write-up together.
- Confirm missing data, access, or ownership details.
- Approve the final workflow for build or release.`;
}

function IconGlyph({ name }) {
  if (name === "check") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    );
  }
  if (name === "view") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  if (name === "close") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m18 6-12 12" />
        <path d="m6 6 12 12" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <rect x="5" y="5" width="11" height="11" rx="2" />
    </svg>
  );
}

function PromptBox({ value = "", editable = false, onChange, placeholder = "", required = false, minLines = 18, showView = true }) {
  const [copyState, setCopyState] = useState("");
  const [expanded, setExpanded] = useState(false);
  const text = String(value || "");
  const lines = (text || placeholder || "").split(/\r?\n/);
  const displayLines = Array.from({ length: Math.max(minLines, lines.length || 1) }, (_, index) => lines[index] ?? "");

  async function copyText() {
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("✓");
    } catch {
      setCopyState("!");
    }
    window.setTimeout(() => setCopyState(""), 2200);
  }

  return (
    <>
      <div className="prompt-box">
        <div className="prompt-box-actions">
          <button className="prompt-icon-button" type="button" onClick={copyText} disabled={!text.trim()} aria-label="Copy" title="Copy">
            <IconGlyph name={copyState === "✓" ? "check" : "copy"} />
          </button>
          {showView && (
            <button className="prompt-icon-button" type="button" onClick={() => setExpanded(true)} disabled={!text.trim()} aria-label="View" title="View">
              <IconGlyph name="view" />
            </button>
          )}
        </div>
        <div className={editable ? "prompt-code-shell editable" : "prompt-code-shell"}>
          <div className="prompt-line-numbers" aria-hidden="true">
            {displayLines.map((_, index) => <span key={index}>{index + 1}</span>)}
          </div>
          {editable ? (
            <textarea
              className="prompt-code-input"
              value={text}
              onChange={(event) => onChange?.(event.target.value)}
              placeholder={placeholder}
              required={required}
            />
          ) : (
            <pre className="prompt-code-content">
              {displayLines.map((line, index) => (
                <span key={index}>{line || "\u00a0"}</span>
              ))}
            </pre>
          )}
        </div>
      </div>
      {expanded && (
        <div className="prompt-modal-backdrop">
          <div className="prompt-modal" role="dialog" aria-modal="true" aria-label="Prompt view">
            <div className="prompt-modal-actions">
              <button className="prompt-icon-button" type="button" onClick={copyText} disabled={!text.trim()} aria-label="Copy" title="Copy">
                <IconGlyph name={copyState === "✓" ? "check" : "copy"} />
              </button>
              <button type="button" className="prompt-icon-button" onClick={() => setExpanded(false)} aria-label="Close prompt view" title="Close">
                <IconGlyph name="close" />
              </button>
            </div>
            <PromptBox value={text} minLines={24} showView={false} />
          </div>
        </div>
      )}
    </>
  );
}

function PromptOutput({ job, showPrompt = true, mode = "prompt", title = "Package output" }) {
  const output = typeof job === "string" ? job : job?.output;
  const [copyStatus, setCopyStatus] = useState("");
  const artifactItems = getArtifactItems(job, mode);
  const hasDocArtifacts = mode !== "elk" && artifactItems.some((item) => item.value);
  const canDownload = Boolean(buildDocsContent(job, artifactItems));
  const showCopy = false;
  const showDownload = mode === "docs" || hasDocArtifacts;

  async function copyGeneratedPrompt() {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopyStatus("Copied");
      window.setTimeout(() => setCopyStatus(""), 2200);
    } catch {
      setCopyStatus("Copy failed");
      window.setTimeout(() => setCopyStatus(""), 2200);
    }
  }

  return (
    <Panel title={title}>
      <div className="output-actions">
        {showCopy && <button type="button" onClick={copyGeneratedPrompt} disabled={!output}>
          {copyStatus || "Copy"}
        </button>}
        {showDownload && <button type="button" onClick={() => downloadDocsPdf(job, artifactItems)} disabled={!canDownload}>
          Download
        </button>}
      </div>
      {showPrompt && <PromptBox value={output || "Your generated package will appear here."} />}
      {!showPrompt && !canDownload && <PromptBox value="Your generated documents will appear here." minLines={10} />}
      {job && typeof job === "object" && (
        <div className="artifact-grid">
          {artifactItems.map((item) => (
            <Artifact
              key={item.title}
              title={item.title}
              value={item.value}
              onDownload={showDownload ? () => downloadDocPdf(job, item) : undefined}
            />
          ))}
        </div>
      )}
    </Panel>
  );
}

function Artifact({ title, value, onDownload }) {
  if (!value) return null;
  return (
    <details className="artifact">
      <summary>
        <span>{title}</span>
        {onDownload && (
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onDownload();
            }}
          >
            Download
          </button>
        )}
      </summary>
      <PromptBox value={value} minLines={8} />
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

function HelpLabel({ label, help }) {
  return (
    <span className="field-label">
      {label}
      {help && (
        <span className="help-dot" tabIndex="0" aria-label={help} title={help}>
          i
        </span>
      )}
    </span>
  );
}

function TextInput({ label, value, onChange, required, help }) {
  return (
    <label>
      <HelpLabel label={label} help={help} />
      <input value={value} onChange={(event) => onChange(event.target.value)} required={required} />
    </label>
  );
}

function SelectInput({ label, value, options, onChange, help }) {
  return (
    <label>
      <HelpLabel label={label} help={help} />
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

