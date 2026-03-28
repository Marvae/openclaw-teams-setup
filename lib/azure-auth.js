// Azure authentication — az login, extract tenant/subscription.

import { execSync, spawnSync } from "node:child_process";
import * as ui from "./ui.js";

export function isLoggedIn() {
  try {
    execSync("az account show", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export async function ensureLoggedIn() {
  if (isLoggedIn()) {
    ui.success("Azure CLI logged in");
    return;
  }

  // Use device code flow if no TTY or if running non-interactively (SSH, CI)
  const useDeviceCode = !process.stdout.isTTY || ui.isAutoAccept();
  if (useDeviceCode) {
    ui.info("Sign in to Azure (device code flow)...");
  } else {
    ui.info("Sign in to Azure (browser will open)...");
  }
  const loginArgs = useDeviceCode ? ["login", "--use-device-code"] : ["login"];
  const result = spawnSync("az", loginArgs, { stdio: "inherit" });
  if (result.status !== 0) {
    ui.error("Azure login failed.");
    ui.info("Try manually: az login");
    ui.info("If you don't have an Azure account: https://azure.microsoft.com/free");
    process.exit(1);
  }
  ui.success("Azure CLI logged in");
}

export function getAccountInfo() {
  try {
    const raw = execSync("az account show --output json", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    const account = JSON.parse(raw);

    // Get the user's AAD object ID for Teams DM allowlisting
    let userObjectId;
    try {
      userObjectId = execSync("az ad signed-in-user show --query id -o tsv", {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();
    } catch {
      // Non-fatal — Graph permissions may not be available
    }

    return {
      tenantId: account.tenantId,
      subscriptionId: account.id,
      subscriptionName: account.name,
      user: account.user?.name || "unknown",
      userObjectId,
    };
  } catch {
    ui.error("Failed to read Azure account info.");
    ui.info("Try: az account show");
    process.exit(1);
  }
}

export async function selectSubscription() {
  let subs;
  try {
    const raw = execSync("az account list --output json --all", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    subs = JSON.parse(raw);
  } catch {
    ui.error("Failed to list Azure subscriptions.");
    process.exit(1);
  }

  const enabled = subs.filter((s) => s.state === "Enabled");
  if (enabled.length === 0) {
    ui.error("No enabled Azure subscriptions found.");
    ui.info("Create a free account: https://azure.microsoft.com/free");
    process.exit(1);
  }

  if (enabled.length === 1) {
    return enabled[0];
  }

  const choice = await ui.select(
    "Multiple subscriptions found. Which one?",
    enabled.map((s) => ({
      value: s.id,
      name: `${s.name} (${s.id})`,
    })),
  );

  // Set the selected subscription as active
  execSync(`az account set --subscription "${choice}"`, { stdio: "pipe" });

  return enabled.find((s) => s.id === choice);
}
