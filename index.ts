#! /usr/bin/env bun
// this is called shebang
// it tells my computer that he has to run this file using bun

import { Command } from "commander";
import { runWakeup } from "./tui/Wakeup";

const program = new Command();

program.name("closedclaw-build").description("closedclaw cli").version("0.0.1") // our program's name and desc

program.command("wakeup").description("show the banner, pick cli and pick telegram mode").action(async()=>{
    await runWakeup()
})

await program.parseAsync(process.argv);