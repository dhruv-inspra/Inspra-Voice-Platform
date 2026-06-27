import { useEffect, useMemo, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from "firebase/auth";
import { apiRequest } from "./lib/api";
import { auth, firebaseConfigured } from "./lib/firebase";

const tabs = [
  { id: "clients", label: "Clients" },
  { id: "tasks", label: "Tasks" },
  { id: "optimize", label: "Optimize Prompt" },
  { id: "newPrompt", label: "New Prompt" }
];

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
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });

    return unsubscribe;
  }, []);

  if (authLoading) {
    return <div className="screen-center">Loading...</div>;
  }

  if (!user) {
    return <LoginPage />;
  }

  return <PlatformApp user={user} />;
}

function LoginPage() {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      if (mode === "reset") {
        await sendPasswordResetEmail(auth, email);
        setMessage("Password reset email sent.");
        return;
      }

      if (mode === "signup") {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        if (name.trim()) {
          await updateProfile(result.user, { displayName: name.trim() });
        }
        return;
      }

      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      setMessage(formatAuthError(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="brand-row">
          <div className="mark">V</div>
          <div>
            <strong>Voice Agent OS</strong>
            <span>Inspra AI</span>
          </div>
        </div>

        <h1>{mode === "signup" ? "Create your account" : mode === "reset" ? "Reset password" : "Log in"}</h1>
        <p>Access clients, tasks, prompt optimization, and new prompt generation.</p>

        {!firebaseConfigured && (
          <div className="notice">Add Firebase web app keys to <code>frontend/.env</code> before using login.</div>
        )}

        <form className="form-stack" onSubmit={handleSubmit}>
          {mode === "signup" && (
            <label>
              Name
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Dhruv Garg" />
            </label>
          )}
          <label>
            Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          {mode !== "reset" && (
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={6}
                required
              />
            </label>
          )}

          {message && <div className="notice">{message}</div>}

          <button className="primary" disabled={loading}>
            {loading ? "Please wait..." : mode === "signup" ? "Create Account" : mode === "reset" ? "Send Reset Link" : "Log In"}
          </button>
        </form>

        <div className="auth-links">
          <button type="button" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
            {mode === "login" ? "Create account" : "Back to login"}
          </button>
          <button type="button" onClick={() => setMode("reset")}>Forgot password</button>
        </div>
      </section>
    </main>
  );
}

function PlatformApp({ user }) {
  const [activeTab, setActiveTab] = useState("clients");
  const [clients, setClients] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [promptOutput, setPromptOutput] = useState("");

  async function getToken() {
    return user.getIdToken();
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
  }, []);

  const currentTitle = useMemo(() => tabs.find((tab) => tab.id === activeTab)?.label || "Clients", [activeTab]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-row">
          <div className="mark">V</div>
          <div>
            <strong>Voice Agent OS</strong>
            <span>{user.displayName || user.email}</span>
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

        <button className="ghost" onClick={() => signOut(auth)}>Log out</button>
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
      </main>
    </div>
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

function formatAuthError(error) {
  if (error.code === "auth/invalid-credential") return "Invalid email or password.";
  if (error.code === "auth/email-already-in-use") return "That email is already registered.";
  if (error.code === "auth/weak-password") return "Password must be at least 6 characters.";
  return error.message || "Authentication failed.";
}
