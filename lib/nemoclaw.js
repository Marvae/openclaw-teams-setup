// Install NemoClaw and run its interactive onboard wizard.
// We delegate to NemoClaw's own installer — we do NOT reimplement its logic.

import { execSync, spawnSync } from "node:child_process";
import * as ui from "./ui.js";

const INSTALL_CMD = {
  darwin: "curl -fsSL https://www.nvidia.com/nemoclaw.sh | bash",
  linux: "curl -fsSL https://www.nvidia.com/nemoclaw.sh | bash",
  win32: 'powershell -c "irm https://www.nvidia.com/nemoclaw.ps1 | iex"',
};

export async function installNemoClaw() {
  const platform = process.platform;
  const cmd = INSTALL_CMD[platform];
  if (!cmd) {
    ui.error(`Unsupported platform: ${platform}`);
    process.exit(1);
  }

  const spin = ui.spinner("Installing NemoClaw...");
  spin.start();

  try {
    execSync(cmd, { stdio: "pipe", shell: true });
    spin.succeed("NemoClaw installed");
  } catch (err) {
    spin.fail("NemoClaw installation failed");
    console.log();
    ui.info("Try installing manually:");
    ui.info(`  ${cmd}`);
    console.log();
    ui.info("Common fixes:");
    ui.info("  • Check your network connection");
    ui.info("  • Run with sudo if permissions are denied");
    process.exit(1);
  }
}

export async function onboardNemoClaw() {
  ui.step("Running NemoClaw onboard wizard...");
  ui.hint("This handles provider selection, API key, sandbox creation, and policies.");
  console.log();

  const result = spawnSync("nemoclaw", ["onboard"], {
    stdio: "inherit",
    shell: true,
  });

  if (result.status !== 0) {
    console.log();
    ui.error("NemoClaw onboard did not complete.");
    ui.info("NemoClaw has built-in resume — run this to continue:");
    ui.info("  nemoclaw onboard");
    process.exit(1);
  }

  ui.success("NemoClaw ready");
}

export function getInstallCommand(platform) {
  return INSTALL_CMD[platform] || null;
}
