#!/usr/bin/env node

// Cleanup script for Azure integration test resources.
// Deletes any leftover test-ots-* bots and app registrations
// in the test resource group.
//
// Usage: npm run test:azure:teardown

import { execSync } from "node:child_process";

const RG = process.env.OPENCLAW_TEAMS_TEST_RG || "rg-openclaw-teams-test";

function az(cmd) {
  return execSync(`az ${cmd}`, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
}

console.log(`Cleaning up test resources in ${RG}...`);

// Find and delete test bots (use az resource list since az bot list doesn't exist)
try {
  const resources = JSON.parse(
    az(`resource list --resource-group "${RG}" --resource-type "Microsoft.BotService/botServices" --output json`),
  );
  const testBots = resources.filter((r) => r.name.startsWith("test-ots-"));

  for (const bot of testBots) {
    console.log(`  Deleting bot: ${bot.name}`);
    try {
      az(`bot delete --name "${bot.name}" --resource-group "${RG}" --output none`);
    } catch (err) {
      console.error(`  Failed to delete bot ${bot.name}: ${err.message}`);
    }
  }

  if (testBots.length === 0) {
    console.log("  No test bots found.");
  }
} catch (err) {
  console.error(`  Failed to list bots: ${err.message}`);
}

// Find and delete test app registrations
try {
  const apps = JSON.parse(az(`ad app list --display-name "test-ots-" --output json`));
  const testApps = apps.filter((a) => a.displayName.startsWith("test-ots-"));

  for (const app of testApps) {
    console.log(`  Deleting app registration: ${app.displayName} (${app.appId})`);
    try {
      az(`ad app delete --id "${app.id}" --output none`);
    } catch (err) {
      console.error(`  Failed to delete app ${app.displayName}: ${err.message}`);
    }
  }

  if (testApps.length === 0) {
    console.log("  No test app registrations found.");
  }
} catch (err) {
  console.error(`  Failed to list app registrations: ${err.message}`);
}

console.log("Done.");
