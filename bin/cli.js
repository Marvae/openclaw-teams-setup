#!/usr/bin/env node

// openclaw-teams-setup — one command to get an AI agent running in Microsoft Teams.

import * as ui from "../lib/ui.js";
import { detectAndRoute } from "../lib/detect.js";
import { ensureDependencies } from "../lib/deps.js";
import { ensureLoggedIn, getAccountInfo, selectSubscription } from "../lib/azure-auth.js";
import { ensureResourceGroup, createBot, updateEndpoint } from "../lib/azure-bot.js";
import { setupTunnel, hostTunnel } from "../lib/tunnel.js";
import { mergeTeamsConfig } from "../lib/openclaw-config.js";
import { createAppPackage } from "../lib/manifest.js";
import { loadState, saveState } from "../lib/state.js";
import { showStatus } from "../lib/status.js";
import { teardown } from "../lib/teardown.js";
import { ensureTeamsPolicy } from "../lib/policy.js";

const args = process.argv.slice(2);

// --yes / --non-interactive: auto-accept all prompts with defaults
if (args.includes("--yes") || args.includes("--non-interactive")) {
  ui.setAutoAccept(true);
}

async function main() {
  // Route to subcommands
  if (args.includes("--status")) {
    await showStatus();
    return;
  }

  if (args.includes("--tunnel")) {
    await hostTunnel();
    return;
  }

  if (args.includes("--teardown")) {
    await teardown();
    return;
  }

  if (args.includes("--reconfigure")) {
    await reconfigure();
    return;
  }

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  // ── Check for existing setup — if complete, just start the tunnel ──

  const existingState = loadState();
  if (existingState.botName && existingState.tunnelName && existingState.configPath) {
    console.log();
    ui.info("openclaw-teams-setup — existing setup found");
    console.log();
    ui.success(`Bot: ${existingState.botName}`);
    ui.success(`Tunnel: ${existingState.tunnelName}`);
    console.log();
    ui.info("Starting tunnel... (Ctrl+C to stop)");
    await hostTunnel();
    return;
  }

  // ── Main wizard ─────────────────────────────────────────────────

  console.log();
  ui.info("openclaw-teams-setup — one command to get an AI agent in Teams");
  console.log();

  // Step 0: Detect agent setup and route
  ui.step("Checking your system...");
  const detection = await detectAndRoute();

  // Step 0.5 + 1: Policy setup and dependency check run in parallel
  // (they are independent — policy touches NemoClaw sandbox, deps checks az/devtunnel)
  await Promise.all([
    detection.type === "nemoclaw" ? ensureTeamsPolicy() : Promise.resolve(),
    ensureDependencies(),
  ]);

  // Step 2: Azure auth
  ui.step("Step 1/3: Set up Azure Bot");
  await ensureLoggedIn();
  const account = getAccountInfo();
  ui.success(`Signed in as ${account.user}`);
  ui.hint(`Subscription: ${account.subscriptionName}`);

  // Check for multiple subscriptions
  const sub = await selectSubscription();
  const tenantId = sub.tenantId || account.tenantId;

  // Bot name — use existing or prompt
  const state = loadState();
  let botName = state.botName;
  if (!botName) {
    botName = await ui.input("Bot name:", "openclaw-teams");
  }

  let resourceGroup = state.resourceGroup;
  if (!resourceGroup) {
    resourceGroup = await ui.input("Resource group:", "rg-openclaw");
  }

  await ensureResourceGroup(resourceGroup);

  const bot = await createBot({ botName, resourceGroup, tenantId });

  // Save state incrementally so re-runs can resume
  saveState({
    botName: bot.botName,
    resourceGroup: bot.resourceGroup,
    appId: bot.appId,
    appPassword: bot.appPassword,
    tenantId,
    configPath: detection.configPath,
  });

  // Steps 2-3: Tunnel setup, config merge, and app package run in parallel
  // (tunnel needs bot name; config and app package need bot details — all available now)
  ui.step("Step 2/3: Set up tunnel + configure");

  const tunnelPromise = setupTunnel(bot.botName, 3978).then((tunnel) => {
    // Update bot endpoint with tunnel URL (must wait for tunnel)
    if (tunnel.tunnelUrl) {
      const endpoint = `${tunnel.tunnelUrl}/api/messages`;
      updateEndpoint(bot.botName, bot.resourceGroup, endpoint);
    }
    return tunnel;
  });

  const configPromise = Promise.resolve().then(() => {
    const spinConfig = ui.spinner("Writing config...");
    spinConfig.start();
    try {
      mergeTeamsConfig(detection.configPath, {
        appId: bot.appId,
        appPassword: bot.appPassword,
        tenantId,
        userObjectId: account.userObjectId,
      });
      spinConfig.succeed("OpenClaw config updated");
    } catch (err) {
      spinConfig.fail("Failed to update config");
      ui.info("  Add this to your openclaw.json manually:");
      ui.info(
        JSON.stringify(
          { channels: { msteams: { enabled: true, appId: bot.appId, appPassword: "***", tenantId } } },
          null,
          2,
        ),
      );
    }
  });

  ui.step("Step 3/3: Teams App");
  const appPackagePromise = createAppPackage({
    appId: bot.appId,
    botName: bot.botName,
  });

  const [tunnel, , zipPath] = await Promise.all([tunnelPromise, configPromise, appPackagePromise]);

  // Ensure Teams channel enable has completed (fired concurrently from createBot)
  if (bot.teamsChannelPromise) await bot.teamsChannelPromise;

  // Save full state
  saveState({
    botName: bot.botName,
    resourceGroup: bot.resourceGroup,
    appId: bot.appId,
    appPassword: bot.appPassword,
    tenantId,
    tunnelProvider: tunnel.provider,
    tunnelName: tunnel.tunnelName,
    tunnelUrl: tunnel.tunnelUrl,
    configPath: detection.configPath,
    createdAt: new Date().toISOString(),
  });

  // Final instructions
  console.log();
  ui.box([
    "",
    "Upload the app to Teams:",
    "",
    '1. Open Microsoft Teams',
    '2. Click "Apps" in the sidebar',
    '3. Click "Manage your apps"',
    '4. Click "Upload an app" → "Upload a custom app"',
    `5. Select: ${zipPath}`,
    "",
    "Then send the bot a message to test!",
    "",
  ]);

  // Start the tunnel so the bot works immediately
  console.log();
  ui.info("Starting tunnel... (Ctrl+C to stop)");
  ui.info("Upload the Teams app while the tunnel is running.");
  console.log();
  hostTunnel();
}

async function reconfigure() {
  const state = loadState();
  if (!state.configPath) {
    ui.error("No previous setup found. Run openclaw-teams-setup first.");
    process.exit(1);
  }

  ui.step("Reconfiguring OpenClaw...");
  mergeTeamsConfig(state.configPath, {
    appId: state.appId,
    appPassword: state.appPassword,
    tenantId: state.tenantId,
  });
  ui.success("Config updated");
}

function printHelp() {
  console.log(`
  openclaw-teams-setup — one command to get an AI agent in Teams

  Usage:
    npx openclaw-teams-setup                  Full setup wizard
    npx openclaw-teams-setup --status         Show current state
    npx openclaw-teams-setup --tunnel         Start the tunnel
    npx openclaw-teams-setup --teardown       Remove bot, tunnel, config
    npx openclaw-teams-setup --reconfigure    Re-run config step
    npx openclaw-teams-setup --help           Show this help
`);
}

main().catch((err) => {
  console.error();
  ui.error(err.message || String(err));
  process.exit(1);
});
