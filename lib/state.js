// Persists setup state to ~/.openclaw-teams-setup.json for idempotency.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const STATE_PATH = path.join(os.homedir(), ".openclaw-teams-setup.json");

export function getStatePath() {
  return STATE_PATH;
}

export function loadState() {
  try {
    const raw = fs.readFileSync(STATE_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function saveState(updates) {
  const current = loadState();
  const merged = { ...current, ...updates };
  fs.writeFileSync(STATE_PATH, JSON.stringify(merged, null, 2) + "\n");
  return merged;
}

export function clearState() {
  try {
    fs.unlinkSync(STATE_PATH);
  } catch {
    // already gone
  }
}
