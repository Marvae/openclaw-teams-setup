import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

vi.mock("../lib/ui.js", () => ({
  success: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
  step: vi.fn(),
  hint: vi.fn(),
  spinner: vi.fn(() => ({ start: vi.fn(), succeed: vi.fn(), fail: vi.fn() })),
  confirm: vi.fn(),
  select: vi.fn(),
  input: vi.fn(),
}));

import { getPresetsDir, installTeamsPreset, isTeamsPresetInstalled } from "../lib/policy.js";

describe("Teams network policy", () => {
  it("teams.yaml template exists and has correct structure", () => {
    const presetPath = path.join(import.meta.dirname, "..", "templates", "teams.yaml");
    const content = fs.readFileSync(presetPath, "utf-8");

    // Has preset metadata
    expect(content).toContain("name: teams");
    expect(content).toContain("description:");

    // Has required Bot Framework domains
    expect(content).toContain("login.microsoftonline.com");
    expect(content).toContain("login.botframework.com");
    expect(content).toContain("smba.trafficmanager.net");
    expect(content).toContain("api.botframework.com");
    expect(content).toContain("graph.microsoft.com");
  });

  it("teams.yaml follows NemoClaw preset format", () => {
    const presetPath = path.join(import.meta.dirname, "..", "templates", "teams.yaml");
    const content = fs.readFileSync(presetPath, "utf-8");

    // Has required top-level keys
    expect(content).toContain("preset:");
    expect(content).toContain("network_policies:");

    // Has enforcement and tls settings
    expect(content).toContain("enforcement: enforce");
    expect(content).toContain("tls: terminate");

    // Has binary allowlist
    expect(content).toContain("binaries:");
    expect(content).toContain("/usr/local/bin/node");
  });

  it("getPresetsDir returns NemoClaw presets path", () => {
    const dir = getPresetsDir();
    expect(dir).toContain(".nemoclaw");
    expect(dir).toContain("presets");
  });
});
