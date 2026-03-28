// Console output helpers — colors, spinners, prompts, boxes.
// Wraps chalk + ora + @inquirer/prompts so the rest of the codebase
// doesn't import them directly.

import chalk from "chalk";
import ora from "ora";
import { confirm as iqConfirm, select as iqSelect, input as iqInput } from "@inquirer/prompts";

// --yes / --non-interactive mode: auto-accept defaults, skip prompts
let _autoAccept = false;
export function setAutoAccept(val) {
  _autoAccept = val;
}
export function isAutoAccept() {
  return _autoAccept;
}

export function info(msg) {
  console.log(`  ${msg}`);
}

export function success(msg) {
  console.log(`  ${chalk.green("✓")} ${msg}`);
}

export function warn(msg) {
  console.log(`  ${chalk.yellow("⚠")} ${msg}`);
}

export function error(msg) {
  console.error(`  ${chalk.red("✗")} ${msg}`);
}

export function step(label) {
  console.log(`\n  ${chalk.bold(label)}`);
}

export function hint(msg) {
  console.log(`  ${chalk.dim(msg)}`);
}

export function spinner(text) {
  return ora({ text: `  ${text}`, indent: 2 });
}

export async function confirm(message, defaultValue = true) {
  if (_autoAccept) {
    info(`${message} ${defaultValue ? "Yes" : "No"} (--yes)`);
    return defaultValue;
  }
  return iqConfirm({ message, default: defaultValue });
}

export async function select(message, choices) {
  if (_autoAccept) {
    const first = choices[0];
    const val = first.value ?? first;
    const label = first.name ?? first.value ?? first;
    info(`${message} ${label} (--yes)`);
    return val;
  }
  return iqSelect({ message, choices });
}

export async function input(message, defaultValue) {
  if (_autoAccept) {
    info(`${message} ${defaultValue} (--yes)`);
    return defaultValue;
  }
  return iqInput({ message, default: defaultValue });
}

export function box(lines) {
  const maxLen = Math.max(...lines.map((l) => stripAnsi(l).length));
  const pad = (s) => s + " ".repeat(maxLen - stripAnsi(s).length);
  const border = chalk.dim;

  console.log(`  ${border("┌─" + "─".repeat(maxLen + 2) + "─┐")}`);
  for (const line of lines) {
    console.log(`  ${border("│")}  ${pad(line)}  ${border("│")}`);
  }
  console.log(`  ${border("└─" + "─".repeat(maxLen + 2) + "─┘")}`);
}

function stripAnsi(s) {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}
