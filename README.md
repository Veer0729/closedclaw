# closedclaw

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.3.11. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

# inside index.ts
```
#! /usr/bin/env bun
```
> this is called shebang
> it tells my computer that he has to run this file using bun

# inside package.json
```
"bin": {
    "closedclaw-build": "./index.ts"
  }
```
> this tells to create a cli command named "closedclaw-build", and then it exectues index.ts

# bun link
> this tells my bun to register my command globally as a tool

# ToolExecutor — the implementation
Raw TypeScript/Node.js code
Knows nothing about AI
Just does the actual work: reads files, writes files, checks paths etc.
Could be used by anything — a CLI, a web server, a test

# agent_tools — the AI interface
Wraps ToolExecutor in a format the AI model understands
Provides descriptions so the AI knows when to use each tool
Defines input schemas so the AI knows what to pass
Handles the communication layer between AI and code

---

## Adding agents (guide)

This section explains how closedclaw agents are wired, how to add a new one (example: **Research Agent**), and how to use `SKILL.md` files so agents follow reusable workflows.

### Architecture at a glance

Each agent is a **mode** under `modes/`. The same agent can run from **CLI** and **Telegram** by sharing a `runX()` function in `modes/telegraf/agent-run.ts`.

```
modes/<name>/orchestrator.ts     ← CLI flow (Clack prompts)
modes/telegraf/agent-run.ts      ← run<Name>() used by Telegram (and optionally CLI)
modes/telegraf/handler.ts        ← bot.command('/<name>', …)
modes/telegraf/constants.ts      ← WELCOME text
modes/cli.ts                     ← CLI menu option
```

Shared infrastructure (reuse these — do not duplicate):

| Piece | Location | Purpose |
|-------|----------|---------|
| Model | `ai/ai.config.ts` → `getAgentModel()` | OpenRouter model |
| Tool execution | `modes/agents/tool-executor.ts` | Read/write files, skills, shell |
| Action logging | `modes/agents/action-tracker.ts` | Tracks pending mutations |
| Full write tools | `modes/agents/agent-tools.ts` → `createAgentTools()` | Agent mode file edits |
| Web tools | `modes/plan/web-tools.ts` → `createWebTools()` | Search, crawl, fetch (Firecrawl) |
| Approval flow | `modes/agents/approval.ts` | CLI approve/reject staged changes |
| Telegram approval | `modes/telegraf/approval-session.ts` | Inline buttons for approve/reject |
| Telegram formatting | `modes/telegraf/texts.ts` | `replyMd()`, `clip()`, `commandArg()` |

### Agent types already in the project

| Type | Mode | Tools | Writes files? | Approval? |
|------|------|-------|---------------|-----------|
| Read-only Q&A | `ask` | FS read + web + skills | Optional save only | If saving |
| Mutating agent | `agent` | Full agent tools | Yes | Yes |
| Planner | `plan` | Read-only + web + skills | No (plan only) | No |
| Plan executor | plan → proceed | Full tools per step | Yes | Yes |

When adding a new agent, pick the closest row and change **instructions**, **tool set**, and **step limit**.

### Environment variables

```env
OPENROUTER_API_KEY=...           # Required — LLM
OPENROUTER_DEFAULT_MODEL=...     # Required — model id
FIRECRAWL_API_KEY=...            # Required for web_search / web_crawl / fetch_url
TELEGRAM_BOT_TOKEN=...           # Telegram mode
TELEGRAM_OWNER_ID=...            # Your numeric Telegram user/chat id (not TELEGRAM_OWNER_BOT)
SKILLS_DIRS=/path/to/skills      # Optional — extra directories containing SKILL.md files
```

---

## Step-by-step: add a Research Agent

A research agent searches the web and returns a structured report on any topic. Most of the plumbing already exists — you mainly add a new mode, wire Telegram/CLI, and write a focused system prompt.

### Step 1 — Create the mode folder

Create `modes/research/` with at least:

```
modes/research/
├── orchestrator.ts    # CLI entry point
└── instructions.ts    # optional — system prompt & report template
```

**`orchestrator.ts`** should:

1. Prompt the user for a topic (use `@clack/prompts` like `modes/ask/orchestrator.ts`).
2. Build a read-only config (no shell, no file mutations during research).
3. Compose tools: read-only filesystem + web + skills.
4. Run a `ToolLoopAgent` with a higher step limit (~30–40).
5. Print the report (use `renderTerminalMarkdown` from `tui/terminal-md.ts`).
6. Optionally offer to save as `.md` (copy the save flow from ask mode).

**Tool set for research:**

```ts
const tools = {
  ...createReadOnlyTools(executor),
  ...createWebTools(tracker),
  list_skills: /* from agent-tools pattern */,
  read_skill:  /* from agent-tools pattern */,
};
```

**System prompt should instruct the model to:**

- Search multiple sources (`web_search`)
- Deep-read promising pages (`web_crawl` / `fetch_url`)
- Produce a structured report: Summary → Key findings → Details → Sources (URLs)
- Cite URLs for every major claim
- Call `list_skills` / `read_skill` if a research skill exists

### Step 2 — Add Telegram support

In **`modes/telegraf/agent-run.ts`**, add `runResearch()`:

- Copy the shape of `runAsk()` (read-only config, `ToolLoopAgent`, `replyMd()`).
- Use research-specific instructions (report format, cite sources).
- Set `stopWhen: stepCountIs(30)` or higher.
- Do **not** use `finishOrApprove()` unless the agent stages file writes.

In **`modes/telegraf/handler.ts`**, add a command:

```ts
bot.command("research", async (ctx) => {
  if (!isOwner(ctx.chat.id)) return;
  const topic = commandArg(ctx.message.text, "research");
  if (!topic)
    return ctx.reply("Usage: `/research <topic>`", { parse_mode: "Markdown" });
  await ctx.reply("🔬 Researching…");
  void runResearch(ctx, topic).catch(console.error);
});
```

In **`modes/telegraf/constants.ts`**, append to `WELCOME`:

```
/research — Web research report on any topic
```

### Step 3 — Add CLI menu entry

In **`modes/cli.ts`**, add an option and wire it:

```ts
{ value: "research", label: "Research Mode" }
// …
if (mode === "research") await runResearchMode();
```

Import `runResearchMode` from `modes/research/orchestrator.ts`.

### Step 4 — Verify web tools work

Research depends on **`modes/plan/web-tools.ts`**. Without `FIRECRAWL_API_KEY`, `createWebTools()` returns `{}` and the agent cannot search the web.

Test locally:

```bash
bun run index.ts wakeup   # pick CLI → Research
# or use Telegram: /research quantum computing trends
```

### Step 5 — Research vs Ask

| | `/ask` | `/research` |
|--|--------|---------------|
| Focus | Codebase + optional web | Web-first, any topic |
| Output | Short answer | Long report with sections + sources |
| Typical steps | ~20 | ~30–40 |

You do **not** need new APIs — only a new mode with different instructions and wiring.

---

## Using SKILL.md with agents

Skills let you store agent workflows in markdown instead of hardcoding everything in TypeScript.

### Where skills are loaded from

`ToolExecutor.skillRoots()` scans:

1. Paths in `SKILLS_DIRS` (semicolon-separated in `.env`)
2. `~/.cursor/skills-cursor/`
3. `~/.claude/skills/`

Any nested `SKILL.md` file under those roots is discoverable via `list_skills` and readable via `read_skill`.

### Add a research skill

**Option A — global (Cursor skills dir):**

```
~/.cursor/skills-cursor/research/SKILL.md
```

**Option B — project-local:**

```
skills/research/SKILL.md
```

With `.env`:

```env
SKILLS_DIRS=/home/you/Projects/closedclaw/skills
```

### What to put in SKILL.md

```markdown
# Research Agent Skill

## When to use
Use for open-ended web research that must produce a cited report.

## Workflow
1. web_search with 2–3 query variants
2. web_crawl the 3–5 most authoritative URLs
3. Cross-check conflicting claims
4. Write the report using the template below

## Report template
- Executive summary (3–5 sentences)
- Key findings (bullets)
- Detailed analysis (sections)
- Sources (numbered list of URLs)

## Quality rules
- Every major claim must have a source URL
- Prefer primary sources over aggregators
- State uncertainty when evidence is weak
```

### Hook skills into an agent

Add to the agent system prompt:

> Before starting, call `list_skills`. If a relevant `SKILL.md` exists (e.g. research), call `read_skill` and follow its workflow and report template.

The tools `list_skills` and `read_skill` already exist in `agent-tools.ts`, `ask/orchestrator.ts`, and `plan/planner.ts` — copy the same tool definitions into your new mode.

---

## Checklist: add any new agent

Use this for every new agent (research, code review, deploy helper, etc.).

### 1. Define the agent

- [ ] Name (e.g. `research`, `review`)
- [ ] Read-only or mutating?
- [ ] Tool set (read-only FS / web / skills / full agent tools)
- [ ] Max steps (`stepCountIs(N)`)
- [ ] System prompt / instructions
- [ ] Optional: matching `SKILL.md`

### 2. Implement CLI mode

- [ ] Create `modes/<name>/orchestrator.ts`
- [ ] Add menu entry in `modes/cli.ts`

### 3. Implement Telegram mode

- [ ] Add `run<Name>()` in `modes/telegraf/agent-run.ts`
- [ ] Add `bot.command('<name>', …)` in `modes/telegraf/handler.ts`
- [ ] Update `WELCOME` in `modes/telegraf/constants.ts`

### 4. Wire approval (mutating agents only)

- [ ] Call `finishOrApprove()` (Telegram) or `runApprovalFlow()` (CLI) after the agent runs
- [ ] Skip this for read-only agents that never stage file changes

### 5. Test

- [ ] CLI: run from `modes/cli.ts` menu
- [ ] Telegram: command works, owner check passes (`TELEGRAM_OWNER_ID`)
- [ ] Web tools (if used): `FIRECRAWL_API_KEY` set
- [ ] Skills (if used): `list_skills` finds your `SKILL.md`

---

## Scaling: many agents later

When you have more than a handful of agents, consider extracting shared pieces:

```
modes/shared/tool-sets.ts   # readOnlyTools(), webTools(), agentTools()
modes/shared/agents.ts      # { name, instructions, tools, maxSteps }[]
```

Then each mode becomes a thin wrapper: pick config → `ToolLoopAgent` → handle output.

---

## File reference (quick map)

| File | Role |
|------|------|
| `modes/agents/orchestrator.ts` | CLI agent mode |
| `modes/ask/orchestrator.ts` | CLI ask mode |
| `modes/plan/orchestrator.ts` | CLI plan mode |
| `modes/plan/planner.ts` | Plan generation (read-only research) |
| `modes/plan/web-tools.ts` | Firecrawl web search/crawl |
| `modes/telegraf/agent-run.ts` | Telegram `runAsk`, `runAgent`, `runPlanSteps` |
| `modes/telegraf/handler.ts` | Telegram command handlers |
| `modes/agents/tool-executor.ts` | `listSkills()`, `readSkill()`, file I/O |
| `ai/ai.config.ts` | OpenRouter model |
