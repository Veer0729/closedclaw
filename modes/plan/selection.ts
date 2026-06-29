import { multiselect, isCancel } from '@clack/prompts';
import chalk from 'chalk';
import type { Plan, PlanStep } from './types.ts';
import { renderTerminalMarkdown } from '../../tui/terminal-md.ts';


const COMPLEXITY_COLOR: Record<NonNullable<PlanStep['complexity']>, string> = { // map of colours according to the complexity
  low: chalk.green('low'),
  medium: chalk.yellow('medium'),
  high: chalk.red('high'),
};


export function printPlan(plan: Plan): void {
  if (plan.researchSummary?.trim()) { // only print research summary if it's their
    console.log(chalk.bold('\n🔍 Research summary'));
    console.log(renderTerminalMarkdown(plan.researchSummary)); // renders it as markdown
  }
  console.log(chalk.bold('\n📋 Generated Plan\n'));
  for (const [i, s] of plan.steps.entries()) { // gives both i and s steps together
    const tag = s.complexity ? `[${COMPLEXITY_COLOR[s.complexity]}]` : ''; // if complexity exists wrap in bracket
    console.log(`  ${chalk.cyan(`Step ${String(i + 1).padStart(2)}`)}. ${chalk.bold(s.title)} ${tag}`); // pad them like "step 1: ..."
  }
  console.log();
}


export async function selectSteps(plan: Plan): Promise<PlanStep[]> {
  const options = plan.steps.map((s) => ({
    value: s.id, // what gets return
    label: s.title, // what the user sees
    hint: s.complexity ?? '', // hint next to label
  }));

  const picked = await multiselect<string>({
    message: 'Select steps to execute (space toggles, enter confirms)',
    options,
    initialValues: plan.steps.map((s) => s.id), // all steps are pre selected by defualt
    required: false,
  });

  if (isCancel(picked)) return []; // if user presses esc or ctrl+c, returns empty array instead of crashing
  const set = new Set<string>(picked);
  return plan.steps.filter((s) => set.has(s.id));
}
