// --status command: show current setup state.

import { commandExists } from "./detect.js";
import { loadState } from "./state.js";
import { hasTeamsConfig } from "./openclaw-config.js";
import { detectTunnelProvider } from "./tunnel.js";
import { botExists } from "./azure-bot.js";
import * as ui from "./ui.js";

export async function showStatus() {
  const state = loadState();
  console.log();
  console.log("  OpenClaw Teams Status");
  console.log("  " + "─".repeat(40));

  // Agent setup
  if (commandExists("nemoclaw")) {
    ui.success("Agent: NemoClaw installed");
  } else if (commandExists("openclaw")) {
    ui.success("Agent: OpenClaw installed (no sandbox)");
  } else {
    ui.error("Agent: not installed");
  }

  // Bot
  if (state.botName && state.appId) {
    const exists = botExists(state.botName, state.resourceGroup);
    if (exists) {
      ui.success(`Bot: ${state.botName} (App ID: ${state.appId})`);
    } else {
      ui.error(`Bot: ${state.botName} configured but not found in Azure`);
    }
  } else {
    ui.hint("Bot: not configured");
  }

  // Tunnel
  const provider = state.tunnelProvider || detectTunnelProvider();
  if (state.tunnelName && state.tunnelUrl) {
    ui.success(`Tunnel: ${state.tunnelProvider} "${state.tunnelName}" → ${state.tunnelUrl}`);
  } else if (provider) {
    ui.hint(`Tunnel: ${provider} available but not configured`);
  } else {
    ui.error("Tunnel: no provider found");
  }

  // Endpoint
  if (state.tunnelUrl) {
    ui.success(`Endpoint: ${state.tunnelUrl}/api/messages`);
  }

  // Config
  if (state.configPath) {
    if (hasTeamsConfig(state.configPath)) {
      ui.success("Config: msteams enabled in openclaw.json");
    } else {
      ui.warn("Config: openclaw.json exists but msteams not configured");
    }
  } else {
    ui.hint("Config: not set");
  }

  console.log();
}
