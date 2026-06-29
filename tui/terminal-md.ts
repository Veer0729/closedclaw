import { marked } from "marked";
import { markedTerminal } from "marked-terminal";

let ready = false; // prevents re confugring

function ensureMarked(): void {
  if (ready) return; // if already configured, ball out 
  const w = Math.max(40, Math.min(process.stdout.columns || 80, 120)); // get to the terminal's current width
  //   @ts-ignore
  marked.use(markedTerminal({ width: w, reflowText: true }, {})); // configure marked to render markdown
  ready = true; // marks setup as done
}

export function renderTerminalMarkdown(source: string): string { // makes sure setup has hapened 
  ensureMarked();
  return marked.parse(source.trimEnd(), { async: false }) as string;
}