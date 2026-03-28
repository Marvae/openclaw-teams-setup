// Detect OpenClaw/NemoClaw/nothing and route to the correct setup path.

import { execFileSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import * as ui from "./ui.js";
import { installNemoClaw, onboardNemoClaw } from "./nemoclaw.js";

export function commandExists(cmd) {
  try {
    execFileSync(process.platform === "win32" ? "where" : "which", [cmd], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

export async function detectAndRoute() {
  // Path A: NemoClaw found — best case, skip to Teams setup
  if (commandExists("nemoclaw")) {
    ui.success("NemoClaw detected");
    return {
      type: "nemoclaw",
      configPath: path.join(os.homedir(), ".openclaw", "openclaw.json"),
    };
  }

  // Path B: OpenClaw found without NemoClaw — recommend upgrade
  if (commandExists("openclaw")) {
    ui.success("OpenClaw detected");
    ui.warn("Running without a security sandbox.");
    ui.info("NemoClaw wraps OpenClaw with:");
    ui.info("  • Network policies (controls what the agent can reach)");
    ui.info("  • Filesystem isolation (agent can't access your files)");
    ui.info("  • Tool restrictions (blocks dangerous commands by default)");
    console.log();

    const choice = ui.isAutoAccept()
      ? "continue"
      : await ui.select("What would you like to do?", [
          { value: "upgrade", name: "Set up NemoClaw first (recommended — adds sandboxing)" },
          { value: "continue", name: "Continue with OpenClaw as-is" },
        ]);
    if (ui.isAutoAccept()) ui.info("Continuing with OpenClaw as-is (--yes)");

    if (choice === "upgrade") {
      await installNemoClaw();
      await onboardNemoClaw();
    }

    return {
      type: choice === "upgrade" ? "nemoclaw" : "openclaw",
      configPath: path.join(os.homedir(), ".openclaw", "openclaw.json"),
    };
  }

  // Path C: Nothing found — install NemoClaw from scratch
  ui.info("No agent detected. Setting up NemoClaw (OpenClaw + security sandbox).");
  console.log();
  ui.info("This will install NemoClaw — an AI agent platform that runs");
  ui.info("on your machine with security sandboxing enabled by default.");
  console.log();

  const ok = await ui.confirm("Continue?", true);
  if (!ok) process.exit(0);

  await installNemoClaw();
  await onboardNemoClaw();

  return {
    type: "nemoclaw",
    configPath: path.join(os.homedir(), ".openclaw", "openclaw.json"),
    pluginInstall: "openclaw plugins install @openclaw/msteams",
  };
}
