import { isCancel } from "@clack/core";
import chalk from "chalk";
import { text } from "@clack/prompts";
import { defaultAgentConfig } from "./types";
import { ActionTracker } from "./action-tracker";
import { ToolExecutor } from "./tool-executor";
import { createAgentTools } from "./agent-tools";
import { stepCountIs, ToolLoopAgent } from "ai";
import { getAgentModel } from "../../ai";
import string from "figlet/fonts/babyface-lame";
import { renderTerminalMarkdown } from "../../tui/terminal-md";
import { runApprovalFlow } from "./approval";

export async function runAgentMode() {
  console.log(chalk.bold("\n🤖 Agent Mode\n"));

  const goal = await text({
    message: "what would you like your agent to do?",
    placeholder: "Concrete task for this codebase"
  });

  if(isCancel(goal) || !goal.trim()) return; // If the user cancelled OR [!goal.trim()] typed nothing useful, bail out immediately.

  const config = defaultAgentConfig() // defualt configurations of my agent
  const tracker = new ActionTracker()
  const executor = new ToolExecutor(tracker, config)
  const tools = createAgentTools(executor)

  const agent = new ToolLoopAgent({
    model: getAgentModel(),
    stopWhen: stepCountIs(30),
    instructions: [`Workspace root: ${config.codebasePath}`,
        "All mutations are stage until approved",
    ].join("\n"),
    tools,
  })

  const result = await agent.generate({
    prompt: goal.trim(), // send goal to agent and removes accidental spacing
    onStepFinish:({toolCalls}) => { // callback is fired after each step the agent takes, A "step" is one round of: AI thinks → calls tools → gets results
      for (const tc of toolCalls){ // loops through every loop the ai called in that step
        const preview = JSON.stringify(tc.input).slice(0, 160); // converts tool input to a string
        console.log(
          chalk.green(" ✔️"),
          chalk.bold(string(tc.toolName)),
          chalk.dim(preview + (preview.length >= 160 ? "..." : ""))
        )
      }
    }
  })

  if(result.text?.trim()) console.log(renderTerminalMarkdown(result.text)) // after agent is done print the final text response

  const ok = await runApprovalFlow(tracker); // show the user all the pending changes
  if(!ok) return executor.clearStaging() // If the user said no — clear all staged changes and exit early, clearStaging() wipes the overlay

  const {errors} = executor.applyApprovedFromTracker(); // User said yes — actually commit all staged changes to disk

  if (errors.length){
    console.log(chalk.red("\n some operation reported errors: \n"));
    for (const e of errors) console.log(chalk.red(` - ${e}`))
  }
  else{
  console.log(chalk.green('\n ✔️ Applied \n'))
  }

  executor.clearStaging() // Resets the executor back to a fresh state ready for the next round

}