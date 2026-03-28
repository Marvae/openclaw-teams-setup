import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Override the state path for testing
const TEST_STATE = path.join(os.tmpdir(), `.openclaw-teams-setup-test-${process.pid}.json`);

// We need to mock the STATE_PATH. Since it's a const in state.js,
// we'll test the logic by using the module's exported functions
// and cleaning up afterward.
import { loadState, saveState, clearState, getStatePath } from "../lib/state.js";

afterEach(() => {
  // Clean up actual state file if tests wrote to it
  try {
    fs.unlinkSync(getStatePath());
  } catch {
    // ok
  }
});

describe("state persistence", () => {
  it("loadState returns empty object when no state file exists", () => {
    clearState(); // ensure clean
    expect(loadState()).toEqual({});
  });

  it("saveState writes and merges state", () => {
    clearState();
    saveState({ botName: "test-bot" });
    expect(loadState().botName).toBe("test-bot");

    saveState({ appId: "test-id" });
    const state = loadState();
    expect(state.botName).toBe("test-bot");
    expect(state.appId).toBe("test-id");
  });

  it("clearState removes the state file", () => {
    saveState({ test: true });
    clearState();
    expect(loadState()).toEqual({});
  });
});
