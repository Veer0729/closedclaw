import { Telegraf } from "telegraf";
import chalk from "chalk";
import { registerHandlers } from "./handler";
import { WELCOME } from "./constants";

export async function runTelegramMode(){
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const ownerId = process.env.TELEGRAM_OWNER_BOT;

    const bot = new Telegraf(token!)
    registerHandlers(bot)

    await bot.telegram.sendMessage(ownerId!, WELCOME, {parse_mode: "Markdown"})
     console.log(chalk.green("Sent welcome message to telegram\n"))

    bot.launch()
    console.log(chalk.green("Telegram bot is running. Press Ctrl+C to stop.\n"));

    await new Promise<void>((resolve) => {
    const stop = () => {
      bot.stop("SIGINT");
      resolve();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}