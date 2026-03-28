import { describe, it, expect, vi } from "vitest";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
  spawnSync: vi.fn(() => ({ status: 0 })),
}));

vi.mock("../lib/ui.js", () => ({
  success: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
  step: vi.fn(),
  hint: vi.fn(),
  spinner: vi.fn(() => ({ start: vi.fn(), succeed: vi.fn(), fail: vi.fn() })),
}));

import { getInstallCommand } from "../lib/nemoclaw.js";

describe("getInstallCommand", () => {
  it("returns curl command for macOS", () => {
    const cmd = getInstallCommand("darwin");
    expect(cmd).toContain("curl");
    expect(cmd).toContain("nemoclaw.sh");
  });

  it("returns curl command for Linux", () => {
    const cmd = getInstallCommand("linux");
    expect(cmd).toContain("curl");
    expect(cmd).toContain("nemoclaw.sh");
  });

  it("returns powershell command for Windows", () => {
    const cmd = getInstallCommand("win32");
    expect(cmd).toContain("powershell");
    expect(cmd).toContain("nemoclaw.ps1");
  });

  it("returns null for unsupported platforms", () => {
    expect(getInstallCommand("freebsd")).toBeNull();
  });
});
