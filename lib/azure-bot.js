// Create/update/delete Azure Bot + app registration.
// All operations go through the az CLI for auth edge-case handling.

import { execSync } from "node:child_process";
import * as ui from "./ui.js";
import { loadState, saveState } from "./state.js";

function azJson(cmd) {
  const raw = execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
  return JSON.parse(raw);
}

function azExec(cmd) {
  execSync(cmd, { stdio: ["pipe", "pipe", "pipe"] });
}

export function botExists(botName, resourceGroup) {
  try {
    azJson(`az bot show --name "${botName}" --resource-group "${resourceGroup}" --output json`);
    return true;
  } catch {
    return false;
  }
}

export async function ensureResourceGroup(name, location = "eastus") {
  const spin = ui.spinner(`Ensuring resource group "${name}"...`);
  spin.start();
  try {
    azExec(`az group create --name "${name}" --location "${location}" --output none`);
    spin.succeed(`Resource group "${name}" ready`);
  } catch {
    spin.fail(`Failed to create resource group "${name}"`);
    ui.info(`  Try: az group create --name "${name}" --location "${location}"`);
    process.exit(1);
  }
}

export async function createBot({ botName, resourceGroup, tenantId }) {
  const state = loadState();

  // Check if bot already exists
  if (state.appId && botExists(botName, resourceGroup)) {
    ui.success(`Bot "${botName}" already exists (reusing)`);

    const rotate = await ui.confirm("Rotate client secret?", false);
    if (rotate) {
      return rotateSecret(state.appId, botName, resourceGroup, tenantId);
    }

    return {
      appId: state.appId,
      appPassword: state.appPassword,
      botName,
      resourceGroup,
    };
  }

  // Create app registration
  let appId;
  const spinApp = ui.spinner("Creating app registration...");
  spinApp.start();
  try {
    const app = azJson(`az ad app create --display-name "${botName}" --output json`);
    appId = app.appId;
    spinApp.succeed(`App registration created (${appId})`);
  } catch (err) {
    spinApp.fail("Failed to create app registration");
    ui.info("  Check your Azure AD permissions.");
    ui.info(`  Try: az ad app create --display-name "${botName}"`);
    throw err;
  }

  // Create client secret
  let appPassword;
  const spinSecret = ui.spinner("Creating client secret...");
  spinSecret.start();
  try {
    const cred = azJson(`az ad app credential reset --id "${appId}" --years 2 --output json`);
    appPassword = cred.password;
    spinSecret.succeed("Client secret created");
  } catch (err) {
    spinSecret.fail("Failed to create client secret");
    ui.info(`  Try: az ad app credential reset --id "${appId}" --years 2`);
    throw err;
  }

  // Create bot registration
  const spinBot = ui.spinner(`Creating bot "${botName}"...`);
  spinBot.start();
  try {
    azExec(
      `az bot create --name "${botName}" --resource-group "${resourceGroup}" ` +
        `--app-type SingleTenant --appid "${appId}" --tenant-id "${tenantId}" ` +
        `--sku F0 --output none`,
    );
    spinBot.succeed(`Bot "${botName}" created`);
  } catch (err) {
    // Check if name collision
    if (String(err).includes("already in use") || String(err).includes("conflict") || String(err).includes("not available")) {
      spinBot.fail(`Bot name "${botName}" is taken.`);
      const altName = `${botName}-${Math.random().toString(36).slice(2, 6)}`;
      ui.info(`  Suggestion: try "${altName}"`);
      const retry = await ui.confirm(`Use "${altName}" instead?`, true);
      if (retry) {
        // Delete the tainted app registration and create fresh for the new name
        try {
          azExec(`az ad app delete --id "${appId}" --output none`);
        } catch { /* non-fatal */ }
        return createBot({ botName: altName, resourceGroup, tenantId });
      }
    } else {
      spinBot.fail(`Failed to create bot "${botName}"`);
      ui.info("  Check permissions: you need Contributor role on the resource group");
      ui.info(
        `  Try: az bot create --name "${botName}" --resource-group "${resourceGroup}" ` +
          `--app-type SingleTenant --appid "${appId}" --tenant-id "${tenantId}" --sku F0`,
      );
    }
    throw err;
  }

  // Enable Teams channel
  const spinTeams = ui.spinner("Enabling Teams channel...");
  spinTeams.start();
  try {
    azExec(`az bot msteams create --name "${botName}" --resource-group "${resourceGroup}" --output none`);
    spinTeams.succeed("Teams channel enabled");
  } catch {
    spinTeams.fail("Failed to enable Teams channel");
    ui.info(`  Try: az bot msteams create --name "${botName}" --resource-group "${resourceGroup}"`);
    // Non-fatal — can be done manually
  }

  // Create service principal — az ad app create does NOT create one automatically
  // (unlike the Azure Portal UI). Without it, token acquisition fails with AADSTS7000229.
  const spinSp = ui.spinner("Creating service principal...");
  spinSp.start();
  try {
    azExec(`az ad sp create --id "${appId}"`);
    spinSp.succeed("Service principal created");
  } catch {
    spinSp.fail("Failed to create service principal");
    ui.info(`  Try: az ad sp create --id "${appId}"`);
    // Non-fatal — can be done manually
  }

  const result = { appId, appPassword, botName, resourceGroup };
  saveState(result);
  return result;
}

async function rotateSecret(appId, botName, resourceGroup, tenantId) {
  const spinSecret = ui.spinner("Rotating client secret...");
  spinSecret.start();
  try {
    const cred = azJson(`az ad app credential reset --id "${appId}" --years 2 --output json`);
    spinSecret.succeed("Client secret rotated");
    const result = { appId, appPassword: cred.password, botName, resourceGroup };
    saveState(result);
    return result;
  } catch (err) {
    spinSecret.fail("Failed to rotate client secret");
    throw err;
  }
}

export function updateEndpoint(botName, resourceGroup, endpoint) {
  const spin = ui.spinner("Updating bot messaging endpoint...");
  spin.start();
  try {
    azExec(
      `az bot update --name "${botName}" --resource-group "${resourceGroup}" ` +
        `--endpoint "${endpoint}" --output none`,
    );
    spin.succeed(`Endpoint set to ${endpoint}`);
  } catch {
    spin.fail("Failed to update messaging endpoint");
    ui.info(
      `  Try: az bot update --name "${botName}" --resource-group "${resourceGroup}" --endpoint "${endpoint}"`,
    );
  }
}

export function deleteBot(botName, resourceGroup) {
  const spin = ui.spinner(`Removing bot "${botName}"...`);
  spin.start();
  try {
    // Delete the bot
    azExec(`az bot delete --name "${botName}" --resource-group "${resourceGroup}" --output none`);

    // Delete the app registration
    const state = loadState();
    if (state.appId) {
      try {
        azExec(`az ad app delete --id "${state.appId}" --output none`);
      } catch {
        // non-fatal
      }
    }
    spin.succeed(`Bot "${botName}" removed`);
  } catch {
    spin.fail(`Failed to remove bot "${botName}"`);
    ui.info(`  Try: az bot delete --name "${botName}" --resource-group "${resourceGroup}"`);
  }
}
