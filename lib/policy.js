// Install and apply the Teams network policy preset in NemoClaw's sandbox.
//
// NemoClaw sandboxes are network-isolated by default. The bot needs to reach
// Bot Framework, Azure AD, and Graph API endpoints. This module copies our
// teams.yaml preset into NemoClaw's presets directory and applies it.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import * as ui from "./ui.js";

const TEAMS_PRESET = path.join(import.meta.dirname, "..", "templates", "teams.yaml");

// NemoClaw installs to ~/.nemoclaw/source by default
const NEMOCLAW_PRESETS_DIR = path.join(
  os.homedir(),
  ".nemoclaw",
  "source",
  "nemoclaw-blueprint",
  "policies",
  "presets",
);

export function getPresetsDir() {
  return NEMOCLAW_PRESETS_DIR;
}

export function isTeamsPresetInstalled() {
  return fs.existsSync(path.join(NEMOCLAW_PRESETS_DIR, "teams.yaml"));
}

export function installTeamsPreset() {
  if (!fs.existsSync(NEMOCLAW_PRESETS_DIR)) {
    ui.warn("NemoClaw presets directory not found — skipping policy setup.");
    ui.hint(`Expected: ${NEMOCLAW_PRESETS_DIR}`);
    return false;
  }

  const dest = path.join(NEMOCLAW_PRESETS_DIR, "teams.yaml");
  fs.copyFileSync(TEAMS_PRESET, dest);
  return true;
}

export function getSandboxName() {
  // Read from NemoClaw's registry to find the active sandbox name
  const registryPath = path.join(os.homedir(), ".nemoclaw", "sandboxes.json");
  try {
    const data = JSON.parse(fs.readFileSync(registryPath, "utf-8"));
    const names = Object.keys(data);
    if (names.length === 1) return names[0];
    // Return the first sandbox that looks active
    for (const name of names) {
      if (data[name].status !== "destroyed") return name;
    }
    return names[0];
  } catch {
    return null;
  }
}

export function isPresetApplied(sandboxName) {
  try {
    const raw = execSync(
      `nemoclaw ${sandboxName} policy-list`,
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
    );
    return raw.includes("● teams");
  } catch {
    return false;
  }
}

export async function ensureTeamsPolicy() {
  const sandboxName = getSandboxName();
  if (!sandboxName) {
    ui.hint("No NemoClaw sandbox found — skipping network policy setup.");
    return;
  }

  // Check if already applied
  if (isPresetApplied(sandboxName)) {
    ui.success(`Teams network policy already applied to "${sandboxName}"`);
    return;
  }

  // Install preset file if needed
  if (!isTeamsPresetInstalled()) {
    const installed = installTeamsPreset();
    if (!installed) return;
  }

  // Apply it
  ui.info("Your NemoClaw sandbox needs network access to Azure/Bot Framework.");
  ui.info("Domains: login.microsoftonline.com, smba.trafficmanager.net,");
  ui.info("         api.botframework.com, graph.microsoft.com");
  console.log();

  const ok = await ui.confirm("Apply Teams network policy?", true);
  if (!ok) {
    ui.hint("You can apply it later: nemoclaw " + sandboxName + " policy-add");
    return;
  }

  const spin = ui.spinner(`Applying Teams policy to "${sandboxName}"...`);
  spin.start();
  try {
    // Use openshell policy set directly since nemoclaw policy-add is interactive
    const presetPath = path.join(NEMOCLAW_PRESETS_DIR, "teams.yaml");

    // We need to merge into the existing policy. The simplest approach:
    // read current policy, append our entries, write back.
    // But NemoClaw's applyPreset handles this — call it via nemoclaw CLI
    // by piping the preset name + confirmation.
    execSync(
      `echo "teams\ny" | nemoclaw ${sandboxName} policy-add`,
      { stdio: "pipe", shell: true },
    );
    spin.succeed(`Teams network policy applied to "${sandboxName}"`);
  } catch (err) {
    spin.fail("Failed to apply Teams network policy");
    ui.info(`  Try manually: nemoclaw ${sandboxName} policy-add`);
    ui.hint("  Then select 'teams' from the list.");
  }
}
