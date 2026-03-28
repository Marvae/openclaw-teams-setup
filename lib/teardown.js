// --teardown command: remove bot, tunnel, and config.

import { loadState, clearState } from "./state.js";
import { deleteBot } from "./azure-bot.js";
import { deleteTunnel } from "./tunnel.js";
import { removeTeamsConfig } from "./openclaw-config.js";
import * as ui from "./ui.js";

export async function teardown() {
  const state = loadState();

  if (!state.botName && !state.tunnelName && !state.configPath) {
    ui.info("Nothing to tear down — no previous setup found.");
    return;
  }

  console.log();
  ui.info("This will remove:");
  if (state.botName) {
    ui.info(`  • Azure Bot "${state.botName}" and its app registration`);
  }
  if (state.tunnelName) {
    ui.info(`  • Dev tunnel "${state.tunnelName}"`);
  }
  if (state.configPath) {
    ui.info("  • msteams config from openclaw.json (plugin stays installed)");
  }
  console.log();

  const ok = await ui.confirm("Continue?", false);
  if (!ok) return;

  // Remove bot
  if (state.botName && state.resourceGroup) {
    deleteBot(state.botName, state.resourceGroup);
  }

  // Remove tunnel
  if (state.tunnelName) {
    deleteTunnel();
  }

  // Remove config
  if (state.configPath) {
    const removed = removeTeamsConfig(state.configPath);
    if (removed) {
      ui.success("Teams config removed from openclaw.json");
    }
  }

  // Clear state file
  clearState();
  console.log();
  ui.success("Done.");
}
