import {select, isCancel} from "@clack/prompts"
import chalk from "chalk" // for adding colour in terminal
import figlet from "figlet" // for increasing size of the text
import { error } from "node:console";
import { runCliMode } from "../modes/cli";

const BANNER_FONT = 'ANSI Shadow';
const SHADOW = chalk.hex('#5b4d9e');
const FACE = chalk.hex('#e8dcf8').bold;

// this func is used for styling the banner
function printBannerWithShadow(ascii: string) {

  const bannerLines = ascii.replace(/\s+$/, '').split('\n');
  const maxLen = Math.max(...bannerLines.map((l) => l.length), 0);
  const rowWidth = maxLen + 2;

  for (const line of bannerLines) {
    console.log(SHADOW(('  ' + line).padEnd(rowWidth)));
  }
  process.stdout.write(`\x1b[${bannerLines.length}A`);
  for (const line of bannerLines) {
    console.log(FACE(line.padEnd(rowWidth)));
  }
  console.log();
}


export async function runWakeup() {
    let ascii:string;
    try{
        ascii = figlet.textSync("closedclaw", {font: BANNER_FONT})
    } catch (error){
        ascii = figlet.textSync("closedclaw", {font: BANNER_FONT})
    }

    printBannerWithShadow(ascii)

    const mode = await select({
        message: "which mode do you wanna proceed with?",
        options: [
            {value: "cli", label: "CLI"},
            {value: "Telegram", label: "Telegram"},
            {value: "exit", label: "Exit"}
        ]
    })

    if(isCancel(mode || mode === "exit")){
        console.log(chalk.dim("Goodbye..."))
        return
    }

    if (mode == "cli"){
        console.log(chalk.dim("Starting cli mode..."))
        await runCliMode()
    }
    else if (mode === "Telegram"){
        console.log(chalk.dim("starting telegram mode..."))
    }
}