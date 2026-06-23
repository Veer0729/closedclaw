import chalk from "chalk"
import {select, isCancel} from "@clack/prompts"

export async function runCliMode(){
    while (true){
        const mode = await select({
            message: "Choose a CLI mode",
            options: [
                {value: "agent", label: "Agent Mode"},
                {value: "plan", label: "Plan Mode"},
                {value: "ask", label: "Ask Mode"},
                {value: "back", label: "Back to the main menu"},
            ]
        })

        if (isCancel(mode) || mode === "back") return

        if (mode === "agent"){}
        if (mode === "plan"){}
        if (mode === "ask"){}

        if (mode !== "agent" && mode !=="plan" && mode !== "ask"){
            console.log(chalk.yellow("\nthis mode is not implemented yet\n"))
        }
    }
}