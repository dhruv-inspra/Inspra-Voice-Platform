# Voice Agent OS — System Guide

**What this is:** A compounding AI operating system that builds, documents, and learns from every voice agent engagement. Each client you run through it makes the next one faster and higher quality.

**Built by:** Inspra AI  
**Last updated:** 2026-04-21

---

## Table of Contents

1. [What the System Does](#1-what-the-system-does)
2. [How It's Structured](#2-how-its-structured)
3. [The Five Operations](#3-the-five-operations)
4. [How to Run a New Client (Step-by-Step)](#4-how-to-run-a-new-client-step-by-step)
5. [The Wiki — What Lives Where](#5-the-wiki--what-lives-where)
6. [Skills Reference](#6-skills-reference)
7. [File Naming Conventions](#7-file-naming-conventions)
8. [The Obsidian Graph View](#8-the-obsidian-graph-view)
9. [How Knowledge Compounds Over Time](#9-how-knowledge-compounds-over-time)
10. [Quick-Start Cheat Sheet](#10-quick-start-cheat-sheet)

---

## 1. What the System Does

The Voice Agent OS turns a client discovery call into a complete, production-ready voice agent package — and then stores everything it learned so the next build is smarter.

**One engagement produces:**
- A production-ready system prompt (the agent's "brain")
- Full tech configuration (LLM, STT, TTS, VAD, platform JSON)
- A call flow diagram (PDF)
- A SOW blueprint diagram (PDF)
- A QA checklist
- A test scenario report
- Latency analysis and optimisation notes
- A client wiki page that lives forever

**What makes it different from just using Claude:**  
Every engagement teaches the system something. Latency numbers, voice ratings, prompt failure patterns, client feedback — all stored in the wiki and automatically pulled into every future build. By the tenth client, you're building with ten clients' worth of battle-tested knowledge behind you.

---

## 2. How It's Structured

The project has three layers and they have strict rules:

```
Voice Agent System - 10042026/
│
├── raw-sources/          ← DROP INPUT HERE. Never edit.
│   ├── client-briefs/    ← Paste discovery call transcripts, briefs, emails
│   ├── call-recordings/  ← Post-launch call transcripts, QA notes
│   ├── platform-docs/    ← Vendor documentation you want ingested
│   └── vendor-changelogs/← Provider update notes (e.g. Vapi changelog)
│
├── wiki/                 ← The living knowledge base. Claude owns this.
│   ├── clients/          ← One page per client, forever
│   ├── industries/       ← Patterns by industry (real estate, recruitment…)
│   ├── platforms/        ← Vapi, Retell, LiveKit, ElevenLabs, Deepgram…
│   ├── learnings/        ← Prompt failures, latency data, voice ratings…
│   ├── templates/        ← Reusable agent templates by type
│   ├── recommendations/  ← Best settings per platform
│   ├── voices/           ← Voice catalogs by provider
│   ├── index.md          ← Master catalog of all wiki pages
│   └── log.md            ← Append-only operation history
│
├── output/               ← Client deliverables. One folder per client.
│   ├── Adactin_20260420/
│   └── GoldfishRealEstate_20260411/
│
└── CLAUDE.md             ← The OS instructions. Claude reads this every session.
```

**The golden rule:**
- `raw-sources/` — you drop things in. Claude reads, never writes.
- `wiki/` — Claude reads and writes. This is the brain.
- `output/` — Claude writes. You deliver to clients from here.

---

## 3. The Five Operations

The OS runs five operations. You trigger them by talking to Claude — it detects which one applies based on what you share.

---

### INGEST
**Trigger:** You paste or drop a new document into `raw-sources/`.

**What happens:**
1. Claude reads the document and identifies its type (brief, transcript, vendor doc, etc.)
2. Routes it to the correct wiki pages
3. If it's a client brief → triggers ORCHESTRATE automatically
4. Updates `wiki/index.md` and appends to `wiki/log.md`

**Example:** Drop a Fathom transcript of a discovery call into `raw-sources/call-recordings/` → Claude ingests it, creates or updates the client wiki page, and logs the operation.

---

### ORCHESTRATE
**Trigger:** A client brief lands in `raw-sources/client-briefs/`, or you paste a brief directly into chat.

**What happens (three phases):**

**Pre-flight (you answer two questions):**
1. Which platform? (Vapi / Retell / LiveKit / ElevenLabs Conversational AI)
2. Use ElevenLabs v3 expression tags? (enables emotion, laughter, pause control in the prompt)

Then Claude reads the relevant wiki pages — platform settings, industry patterns, learnings, voice catalog — before writing a single word.

**Phase 1 — Research (three parallel sub-agents):**
- Sub-Agent A: Selects LLM (provider, model, temperature, tokens, reasoning)
- Sub-Agent B: Selects STT + TTS + Voice (provider, model, voice name, settings)
- Sub-Agent C: Reads industry wiki, updates client page

**Phase 2 — Build (depends on Phase 1):**
- Sub-Agent D: Writes the full system prompt using the `inspra-voice` skill

**Phase 3 — Validate & Document (five parallel sub-agents):**
- Sub-Agent E: QA checklist
- Sub-Agent F: Test scenarios and scoring report
- Sub-Agent G: Call flow diagram (PDF via Diagram-Skill-v2)
- Sub-Agent H: SOW blueprint diagram (PDF via Diagram-Skill-v2)
- Sub-Agent I: Latency analysis

**Post-flight:**
- Generates `README.md` in the output folder
- Updates client wiki page and industry page
- Logs the operation

**Output:** A complete client folder with everything needed to launch.

---

### LEARN
**Trigger:** You paste a call transcript, QA report, or client feedback into chat, or drop it in `raw-sources/call-recordings/`.

**What happens:**
1. Claude reads and analyses the input
2. Scores it (accuracy, tone, flow, rules adherence — 1–4 scale)
3. Updates the relevant wiki pages with what was learned
4. Flags anything that contradicts existing wiki knowledge

**Where learnings land:**
- `wiki/learnings/prompt-failures.md` — what caused the agent to go wrong
- `wiki/learnings/latency-findings.md` — real call latency numbers
- `wiki/learnings/voice-ratings.md` — how voices perform in real calls
- `wiki/learnings/qa-patterns.md` — recurring test failures
- `wiki/learnings/client-feedback.md` — what clients complained about or praised
- `wiki/industries/{industry}.md` — industry-specific discoveries
- `wiki/platforms/{platform}.md` — platform-specific findings

**Why this matters:** The next time you build an agent on Vapi for a recruitment client, Claude will already know the latency profile, the best voice for AU English candidates, and what prompt patterns fail in screening calls — because this engagement taught it.

---

### QUERY
**Trigger:** You ask a question about the wiki — "What voices work best for real estate?", "What's the Vapi endpointing setting for noisy environments?", "What did we learn from the Adactin engagement?"

**What happens:**
1. Claude searches the wiki for relevant pages
2. Synthesises an answer with `[[citations]]` to wiki pages
3. If the answer reveals a knowledge gap → creates a new wiki page to fill it
4. Logs the query

---

### LINT
**Trigger:** You ask Claude to "check the wiki" or "do a health check", or run it periodically as maintenance.

**What happens:**
1. Scans for contradictions across wiki pages
2. Finds orphan pages (no incoming links — won't show in Obsidian graph)
3. Finds stale pages (active clients not updated in 30+ days)
4. Checks missing cross-references
5. Auto-fixes safe issues (adds missing links, updates dates)
6. Reports what it found and what it changed

---

## 4. How to Run a New Client (Step-by-Step)

### Step 1 — Discovery Call
Run your discovery call as normal. Record it (Fathom, Zoom, etc.) and get the transcript.

### Step 2 — Drop the Transcript
Save the transcript as a `.md` file and drop it into:
```
raw-sources/call-recordings/
```
Or paste it directly into Claude.

### Step 3 — Trigger ORCHESTRATE
Tell Claude: **"New client brief. Please orchestrate."**  
Or just paste the transcript — Claude detects the brief and kicks off automatically.

### Step 4 — Answer Two Questions
Claude will ask:
1. Which platform? → Answer: `Vapi` / `Retell` / `LiveKit` / `ElevenLabs`
2. ElevenLabs v3 tags? → Answer: `Yes` / `No`

That's all you need to provide. Claude does the rest.

### Step 5 — Wait for Output
Claude builds in phases. Typical time: 5–15 minutes depending on complexity.  
Output lands in: `output/{ClientName}_{YYYYMMDD}/`

### Step 6 — Review Deliverables
Check the `README.md` in the output folder first — it links everything and lists pre-launch actions. Then:
- Review the system prompt for tone and accuracy
- Verify the agent config matches the client's platform
- Run through the QA checklist before handing to client

### Step 7 — Share with Client
The PDFs (call flow + SOW blueprint) are client-facing.  
The system prompt and agent config go to whoever is deploying on the platform.

### Step 8 — After Testing
When the client sends back feedback or test call results, paste them into Claude:
**"Learn from this feedback / these call transcripts."**  
Claude updates the wiki. The knowledge stays.

---

## 5. The Wiki — What Lives Where

The wiki is an Obsidian vault. Open it by pointing Obsidian at the `wiki/` folder.

### `wiki/clients/`
One page per client. Created during ORCHESTRATE, updated after every engagement.  
Contains: contacts, agent specs, integration status, timeline, open items, output folder link.

### `wiki/industries/`
Patterns that repeat across clients in the same sector.  
Created when a new industry appears. Deepens with each client in that industry.  
Examples: `real-estate.md`, `recruitment-staffing.md`, `healthcare.md`

### `wiki/platforms/`
One page per platform (Vapi, Retell, LiveKit, ElevenLabs, Deepgram, OpenAI, etc.).  
Contains: how the platform works, known issues, best configuration, API quirks.  
Updated when vendor changelogs or QA findings are ingested.

### `wiki/learnings/`
The institutional memory. These pages get denser over time.

| Page | What It Stores |
|------|---------------|
| `prompt-failures.md` | Prompt patterns that caused failures in real calls |
| `latency-findings.md` | Real-world latency numbers per platform/provider combo |
| `voice-ratings.md` | How specific voices performed in specific use cases |
| `qa-patterns.md` | Recurring test failures and their fixes |
| `client-feedback.md` | What clients complained about or praised |
| `tool-calling-gotchas.md` | Platform-specific tool calling bugs and workarounds |
| `livekit-production-settings.md` | **MANDATORY** — Inspra-verified LiveKit production stack |

### `wiki/templates/`
Ready-to-use agent outlines for common types. Pulled in during ORCHESTRATE.  
Types: `inbound-receptionist`, `outbound-sales`, `appointment-booking`, `faq-handler`, `after-hours`

### `wiki/recommendations/`
Best settings per platform, informed by learnings. Pulled in during ORCHESTRATE.  
Examples: `vapi-best-settings.md`, `livekit-best-settings.md`

### `wiki/voices/`
Voice catalogs by provider. Pulled in during STT/TTS selection.  
Contains voice names, IDs, characteristics, use case ratings.

---

## 6. Skills Reference

Skills are specialist sub-systems Claude invokes during ORCHESTRATE or on demand. They live in the project root and in Claude's global skills directory.

| Skill | When It Runs | What It Does |
|-------|-------------|--------------|
| `inspra-voice` | Phase 2 of ORCHESTRATE | Writes the full 9-section system prompt |
| `llm-selection-guide` | Phase 1 of ORCHESTRATE | Selects LLM provider, model, and config |
| `stt-tts-selection-guide` | Phase 1 of ORCHESTRATE | Selects STT, TTS, and voice |
| `latency-optimizer` | Phase 3 of ORCHESTRATE | Analyses latency, recommends optimisations |
| `voice-qa-checklist` | Phase 3 of ORCHESTRATE | Generates pre-launch QA checklist |
| `agent-ops-testing` | Phase 3 of ORCHESTRATE | Writes test scenarios and scoring rubric |
| `Diagram-Skill-v2` | Phase 3 of ORCHESTRATE | Generates call flow + SOW blueprint as PDFs |
| `agent-ops-mom` | On demand | Generates meeting minutes from transcript |

**To invoke a skill directly** (outside ORCHESTRATE), just describe what you need:  
`"Generate meeting minutes from this transcript"` → Claude invokes `agent-ops-mom`  
`"Build me a QA checklist for the Adactin agent"` → Claude invokes `voice-qa-checklist`

### The `inspra-voice` Skill — How It Works

This is the core prompt engineering skill. It operates in three modes:

- **Create mode:** Builds a fresh 9-section system prompt from scratch
- **Enhance mode:** Audits an existing prompt and fixes it
- **Educate mode:** Answers questions about voice agent prompt design

The 9 sections of every prompt it writes:
1. Role & Objective
2. Personality & Tone
3. Context
4. Instructions (including Objection Handling)
5. Guardrails (A: Safety · B: Off-Topic · C: Compliance · D: Authority · E: Data Protection · F: Transfer/Exit)
6. Call Flow
7. Example Interactions
8. Knowledge Base (if applicable)
9. Voice Setup Checklist

### The `Diagram-Skill-v2` Skill — How It Works

Generates PDFs using Python (matplotlib) + ReportLab. Two diagrams per engagement:

| Diagram | Type | Size | What It Shows |
|---------|------|------|---------------|
| Call Flow | Decision Tree | 14×17 portrait | Every branch: AMD check → greeting → qualification → outcomes |
| SOW Blueprint | Swim Lane | 17×11 landscape | System architecture: client team / AI platform / integrations |

Both diagrams come with a companion write-up PDF explaining the diagram to non-technical stakeholders.

---

## 7. File Naming Conventions

**Output folders:**
```
output/{ClientName}_{YYYYMMDD}/
```
ClientName is PascalCase, no spaces. One folder per client, all agents inside it.

**Output files:**
```
{AgentType}_{filename}.md
```
Examples:
- `Inbound_system-prompt.md`
- `Outbound_agent-config.md`
- `Inbound_qa-checklist.md`

**Diagram PDFs:**
```
Inspra_{ClientName}_{DiagramType}_v1_{YYYYMMDD}.pdf
Inspra_{ClientName}_{DiagramType}_Writeup_{YYYYMMDD}.pdf
```

**Shared files** (no agent type prefix):
- `README.md` — output folder summary card
- `call-flow.md` — placeholder (replaced by PDF)
- `sow-blueprint.md` — placeholder (replaced by PDF)

**Wiki files:**
- `wiki/clients/{client-name-kebab-case}.md`
- `wiki/industries/{industry-name}.md`
- `wiki/platforms/{platform-name}.md`

**Log entries:**
```
## [YYYY-MM-DD] {operation} | {details}
```
Operations: `ingest` · `orchestrate` · `learn` · `query` · `lint`

---

## 8. The Obsidian Graph View

The wiki is designed to be opened in Obsidian. When working correctly, every page connects to at least two others — forming a dense graph with no orphan nodes.

**To open the vault:**
1. Open Obsidian
2. Open vault → point to `wiki/` folder (not the project root)
3. The graph view (`Ctrl+G`) should show a connected cluster

**Cross-linking rules (enforced by Claude):**
- Every client page links to its `[[industry]]` page
- Every industry page links to relevant `[[template]]` pages
- Every learning links to the `[[client]]` and `[[platform]]` that caused it
- Every output README links back to the `[[client]]` wiki page
- Every `agent-config.md` cites the `[[recommendation]]` pages that informed its choices

**If you see orphan nodes:** Run LINT. Claude will identify and fix missing links automatically.

**The `.obsidian/app.json` `userIgnoreFilters` setting** excludes skills, tools, and other non-wiki folders so they don't clutter the graph:
```json
{
  "userIgnoreFilters": [
    "output", "raw-sources", "Diagram-Skill-v2", "agent-ops-mom",
    "agent-ops-testing", "inspra-voice", "latency-optimizer",
    "llm-selection-guide", "stt-tts-selection-guide",
    "voice-qa-checklist", "docs", "CLAUDE.md"
  ]
}
```

---

## 9. How Knowledge Compounds Over Time

This is the point of the system. Here's what happens after each engagement:

**After Client 1:**
- One platform's best settings documented
- One industry's call patterns recorded
- One voice's performance rated
- One set of prompt patterns tested

**After Client 5:**
- Multiple platform comparisons with real data
- Industry pages thick with call flow patterns, objection handling data, compliance notes
- Voice catalog annotated with real performance ratings
- Prompt failure library that catches issues before launch

**After Client 10:**
- ORCHESTRATE runs faster because wiki context is richer
- Fewer test failures because failure patterns are known in advance
- Voice selection is confident because real AU/US/India data exists
- Industry templates are pre-qualified for each sector

**The compounding mechanism:**
Every ORCHESTRATE starts by reading the relevant wiki pages. The more those pages contain, the better the output — without you doing anything extra. You just keep dropping in transcripts and briefs.

---

## 10. Quick-Start Cheat Sheet

### New client engagement
```
1. Drop discovery call transcript into: raw-sources/call-recordings/
2. Tell Claude: "New client brief. Please orchestrate."
3. Answer: platform? + ElevenLabs v3 tags?
4. Wait. Review output/
5. Deliver call flow PDF + SOW blueprint PDF to client
6. Deploy system prompt + agent config on platform
7. After testing → paste feedback: "Learn from this."
```

### On-demand operations
```
Generate meeting minutes:   "Generate MoM from this transcript"
Audit a prompt:             "Audit this system prompt" (paste it)
Check wiki health:          "Run a wiki lint check"
Query knowledge:            "What voices work best for outbound AU calls?"
Build diagrams only:        "Generate call flow and SOW blueprint for [client]"
```

### Output folder quick-reference
```
{ClientName}_{YYYYMMDD}/
├── README.md                              ← Start here
├── Outbound_system-prompt.md             ← Paste into platform
├── Outbound_agent-config.md              ← Full tech config + platform JSON
├── Outbound_qa-checklist.md              ← Pre-launch checklist
├── Outbound_latency-notes.md             ← Latency profile + optimisations
├── Outbound_test-report.md               ← 12 test scenarios + scoring
├── Inspra_{Client}_CallFlow_v1_YYYYMMDD.pdf         ← Call flow diagram
├── Inspra_{Client}_SOWBlueprint_v1_YYYYMMDD.pdf     ← Architecture blueprint
└── [companion write-up PDFs]
```

### Who gets what
| Deliverable | Goes to |
|-------------|---------|
| Call flow PDF | Client (Sapna / Anusha / Priyanka) |
| SOW blueprint PDF | Client + internal |
| System prompt | Deploying engineer (paste into Vapi/Retell) |
| Agent config JSON | Deploying engineer |
| QA checklist | Tester (Anusha / Sadhana) |
| Test report | Tester + client feedback session |

---

*For questions about this system, open a new Claude Code session in this project directory. Claude reads `CLAUDE.md` on startup and knows the full system context.*
