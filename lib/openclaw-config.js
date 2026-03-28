// Read/write openclaw.json (JSON5 format) — merge in msteams channel config.

import fs from "node:fs";
import path from "node:path";
import JSON5 from "json5";
import * as ui from "./ui.js";

export function readConfig(configPath) {
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    return JSON5.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return {};
    ui.warn(`Could not parse ${configPath}: ${err.message}`);
    return {};
  }
}

export function writeConfig(configPath, config) {
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Back up existing config
  if (fs.existsSync(configPath)) {
    const backupPath = configPath + ".bak";
    fs.copyFileSync(configPath, backupPath);
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
}

export function mergeTeamsConfig(configPath, { appId, appPassword, tenantId, userObjectId, port = 3978 }) {
  const config = readConfig(configPath);

  if (!config.channels) {
    config.channels = {};
  }

  // Build DM access policy: allow the logged-in user by AAD object ID
  const dmAccess = {};
  if (userObjectId) {
    dmAccess.dmPolicy = "allowlist";
    dmAccess.allowFrom = [userObjectId];
  } else {
    // Fallback: open to all if we couldn't get the user's object ID
    dmAccess.dmPolicy = "open";
    dmAccess.allowFrom = ["*"];
  }

  config.channels.msteams = {
    ...config.channels.msteams,
    enabled: true,
    appId,
    appPassword,
    tenantId,
    ...dmAccess,
    webhook: { port, path: "/api/messages" },
  };

  writeConfig(configPath, config);
  return config;
}

export function removeTeamsConfig(configPath) {
  const config = readConfig(configPath);

  if (config.channels?.msteams) {
    delete config.channels.msteams;
    writeConfig(configPath, config);
    return true;
  }
  return false;
}

export function hasTeamsConfig(configPath) {
  const config = readConfig(configPath);
  return config.channels?.msteams?.enabled === true;
}
