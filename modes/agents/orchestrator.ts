import { isCancel } from "@clack/core";
import chalk from "chalk";
import { text } from "node:stream/consumers";
import { defaultAgentConfig } from "./types";
import { ActionTracker } from "./action-tracker";

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
}