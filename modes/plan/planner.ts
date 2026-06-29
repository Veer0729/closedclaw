import {
  Output,
  extractJsonMiddleware,
  generateText,
  stepCountIs,
  tool,
  wrapLanguageModel,
} from "ai";
import { z } from "zod";
import chalk from "chalk";
import { getAgentModel } from "../../ai/ai.config.ts";
import { ActionTracker } from "../agents/action-tracker.ts";
import { ToolExecutor } from "../agents/tool-executor.ts";
import { defaultAgentConfig } from "../agents/types.ts";
import type { Plan, PlanStep } from "../plan/types.ts";
import { createWebTools } from "./web-tools.ts";

const planSchema = z.object({
  researchSummary: z.string().optional(), // optional text summary of what ai found
  steps: z // array of steps
    .array(
      z.object({
        title: z.string(), // short name for the step
        description: z.string(), // what needs to be done
        hints: z.array(z.string()).optional(), // list of tips/suggestions
        complexity: z.enum(["low", "medium", "high"]).optional(), // difficulty rating
      }),
    )
    .min(1)
    .max(15),
});

function readOnlyTools(executor: ToolExecutor) {
  return {
    read_file: tool({
      description:
        "Read a text file from the workspace. use a path relative to the project root",
      inputSchema: z.object({
        path: z.string().describe("relative file path"), // uses Zod to define what input does the tool expects
      }),
      execute: async ({ path: p }) => executor.readFile(p), // calls our tool readFile
    }),

    list_files: tool({
      description: "List files and directories under a path.",
      inputSchema: z.object({
        path: z.string(),
        recursive: z.boolean().optional().default(false),
      }),
      execute: async ({ path: p, recursive }) =>
        executor.listFiles(p, recursive),
    }),

    search_files: tool({
      description:
        'Find files matching a glob pattern (e.g. "*.ts", "**/*.md"). Optional content substring filter.',
      inputSchema: z.object({
        root: z.string().describe("Directory to search, relative to root"),
        pattern: z
          .string()
          .describe("Glob-like pattern using * and ** (forward slashes)"),
        content_contains: z.string().optional(),
      }),
      execute: async ({ root, pattern, content_contains }) =>
        executor.searchFiles(root, pattern, content_contains),
    }),

    analyze_codebase: tool({
      description:
        "Summarize structure: file counts, size, extensions. Read-only.",
      inputSchema: z.object({
        path: z.string().default("."),
      }),
      execute: async ({ path: p }) => executor.analyzeCodebase(p),
    }),

    list_skills: tool({
      description:
        "List absolute paths to SKILL.md files under configured skill directories (Cursor / Claude).",
      inputSchema: z.object({}),
      execute: async () => executor.listSkills(),
    }),

    read_skill: tool({
      description:
        "Read a SKILL.md file. Path must be absolute and under skill roots, or use a path returned by list_skills.",
      inputSchema: z.object({
        path: z.string(),
      }),
      execute: async ({ path: p }) => executor.readSkill(p),
    }),
  };
}

const PLAN_INSTRUCTIONS = (codebase: string, hasWeb: boolean) =>
  [
    "You are a Plan-Mode planner. You DO NOT modify files.",
    `Workspace: ${codebase}`,
    "Use read-only tools for codebase/skills research.",
    hasWeb
      ? "Web tools are available (web_search/web_crawl/fetch_url). Use only when needed."
      : "Web tools are unavailable (no FIRECRAWL_API_KEY).",
    "Output must match the provided JSON schema.",
    "Keep it short: 1–15 steps.",
  ].join("\n");

export async function generatePlan(goal: string) {
  const config = defaultAgentConfig();
  const tracker = new ActionTracker();
  const executor = new ToolExecutor(tracker, config);

  const hasweb = !!process.env.FIRECRAWL_API_KEY
  const model = wrapLanguageModel({
    model: getAgentModel(),
    middleware: extractJsonMiddleware(),
  });

  const tools = { ...readOnlyTools(executor), ...(hasweb ? createWebTools(tracker): {})};


  console.log(chalk.cyan("\n🔍 Researching & drafting a plan…\n"));

  const result = await generateText({
    model,
    tools,
    stopWhen: stepCountIs(20), // saftey limit
    system: PLAN_INSTRUCTIONS(config.codebasePath, hasweb), // system prompt
    prompt: `User goal: \n${goal}`, // actual request
    output: Output.object({ schema: planSchema }), // forces ai to return a structured JSON format
  });

  const validate = planSchema.parse(result.output); // validates again

  const steps: PlanStep[] = validate.steps.map((s, i) => ({ // transform raw validated data into steps
    id: `step-${i + 1}`,
    title: s.title,
    description: s.description,
    hints: s.hints,
    complexity: s.complexity,
  }));

  return { goal, researchSummary: validate.researchSummary, steps };
}
