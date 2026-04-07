// Layer 2: Azure CLI integration tests.
// Requires a real Azure login and the env var OPENCLAW_TEAMS_TEST_RG.
//
// Run:  OPENCLAW_TEAMS_TEST_RG=rg-openclaw-teams-test npm run test:azure
//
// Setup (once):
//   az group create --name rg-openclaw-teams-test --location eastus
//
// Teardown:
//   npm run test:azure:teardown
//   az group delete --name rg-openclaw-teams-test --yes --no-wait

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";

// Azure operations (bot create, channel enable) can take 10-30s
const AZURE_TIMEOUT = 60_000;

const RG = process.env.OPENCLAW_TEAMS_TEST_RG;
const SUFFIX = Math.random().toString(36).slice(2, 6);
const BOT_NAME = `test-ots-${SUFFIX}`;
let appId;

function az(cmd) {
  return execSync(`az ${cmd}`, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
}

function azJson(cmd) {
  return JSON.parse(az(`${cmd} --output json`));
}

// Skip entire suite if no resource group configured or az not logged in
beforeAll(() => {
  if (!RG) {
    console.log("Skipping Azure integration tests: OPENCLAW_TEAMS_TEST_RG not set");
    return;
  }
  try {
    az("account show");
  } catch {
    throw new Error("Azure CLI not logged in. Run: az login");
  }
  // Ensure resource group exists
  az(`group create --name "${RG}" --location eastus --output none`);
});

afterAll(() => {
  if (!RG || !appId) return;
  // Cleanup: delete bot + app registration
  try {
    az(`bot delete --name "${BOT_NAME}" --resource-group "${RG}" --output none`);
  } catch { /* may not exist */ }
  try {
    az(`ad app delete --id "${appId}" --output none`);
  } catch { /* may not exist */ }
});

describe.skipIf(!RG)("Azure Bot lifecycle", () => {
  let tenantId;
  let appPassword;

  it("reads account info", () => {
    const account = azJson("account show");
    tenantId = account.tenantId;
    expect(tenantId).toBeTruthy();
  });

  it("creates an app registration", () => {
    const app = azJson(`ad app create --display-name "${BOT_NAME}"`);
    appId = app.appId;
    expect(appId).toBeTruthy();
    expect(appId).toMatch(/^[0-9a-f-]+$/);
  });

  it("creates a client secret", () => {
    const cred = azJson(`ad app credential reset --id "${appId}" --years 1`);
    appPassword = cred.password;
    expect(appPassword).toBeTruthy();
    expect(appPassword.length).toBeGreaterThan(10);
  });

  it("creates a bot (F0 tier, SingleTenant)", { timeout: AZURE_TIMEOUT }, () => {
    az(
      `bot create --name "${BOT_NAME}" --resource-group "${RG}" ` +
      `--app-type SingleTenant --appid "${appId}" --tenant-id "${tenantId}" ` +
      `--sku F0 --output none`
    );

    // Verify it exists
    const bot = azJson(`bot show --name "${BOT_NAME}" --resource-group "${RG}"`);
    expect(bot.name).toBe(BOT_NAME);
  });

  it("enables Teams channel", { timeout: AZURE_TIMEOUT }, () => {
    az(`bot msteams create --name "${BOT_NAME}" --resource-group "${RG}" --output none`);

    // Verify channel exists
    const raw = az(`bot msteams show --name "${BOT_NAME}" --resource-group "${RG}" --output json`);
    const channel = JSON.parse(raw);
    expect(channel).toBeTruthy();
  });

  it("updates messaging endpoint", { timeout: AZURE_TIMEOUT }, () => {
    const endpoint = "https://example.devtunnels.ms/api/messages";
    az(
      `bot update --name "${BOT_NAME}" --resource-group "${RG}" ` +
      `--endpoint "${endpoint}" --output none`
    );

    const bot = azJson(`bot show --name "${BOT_NAME}" --resource-group "${RG}"`);
    expect(bot.properties?.endpoint).toBe(endpoint);
  });

  it("is idempotent — re-showing bot works", () => {
    const bot = azJson(`bot show --name "${BOT_NAME}" --resource-group "${RG}"`);
    expect(bot.name).toBe(BOT_NAME);
  });

  it("creates a service principal", () => {
    // az ad app create does NOT create a service principal automatically.
    // Without it, token acquisition fails with AADSTS7000229.
    az(`ad sp create --id "${appId}"`);

    // Verify it exists
    const sp = azJson(`ad sp show --id "${appId}"`);
    expect(sp.appId).toBe(appId);
  });

  it("tears down bot", { timeout: AZURE_TIMEOUT }, () => {
    az(`bot delete --name "${BOT_NAME}" --resource-group "${RG}" --output none`);

    // Verify it's gone
    let exists = true;
    try {
      az(`bot show --name "${BOT_NAME}" --resource-group "${RG}" --output none`);
    } catch {
      exists = false;
    }
    expect(exists).toBe(false);
  });

  it("tears down app registration", () => {
    az(`ad app delete --id "${appId}" --output none`);

    // Verify it's gone
    let exists = true;
    try {
      az(`ad app show --id "${appId}" --output none`);
    } catch {
      exists = false;
    }
    expect(exists).toBe(false);

    // Clear so afterAll doesn't double-delete
    appId = null;
  });
});
