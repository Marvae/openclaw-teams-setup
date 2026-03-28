import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
  execSync: vi.fn(),
}));

vi.mock("../lib/ui.js", () => ({
  success: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
  step: vi.fn(),
  hint: vi.fn(),
  spinner: vi.fn(() => ({ start: vi.fn(), succeed: vi.fn(), fail: vi.fn(), set text(v) {} })),
  confirm: vi.fn(),
  select: vi.fn(),
  input: vi.fn(),
}));

import { execFileSync } from "node:child_process";
import { getMissingDeps, getInstallCommand } from "../lib/deps.js";

describe("getMissingDeps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array when all deps are present", () => {
    execFileSync.mockReturnValue("");
    expect(getMissingDeps()).toEqual([]);
  });

  it("returns az when it's missing", () => {
    execFileSync.mockImplementation((cmd, args) => {
      if (args[0] === "az") throw new Error("not found");
      return ""; // devtunnel exists
    });
    const missing = getMissingDeps();
    expect(missing.length).toBe(1);
    expect(missing[0].name).toBe("Azure CLI");
  });

  it("skips tunnel dep when ngrok is present as alternate", () => {
    execFileSync.mockImplementation((cmd, args) => {
      if (args[0] === "devtunnel") throw new Error("not found");
      if (args[0] === "ngrok") return "";
      if (args[0] === "cloudflared") throw new Error("not found");
      return ""; // az exists
    });
    const missing = getMissingDeps();
    expect(missing.every((d) => d.name !== "Dev Tunnels CLI")).toBe(true);
  });

  it("includes tunnel dep when no tunnel provider is present", () => {
    execFileSync.mockImplementation((cmd, args) => {
      if (["devtunnel", "ngrok", "cloudflared"].includes(args[0])) throw new Error("not found");
      return ""; // az exists
    });
    const missing = getMissingDeps();
    expect(missing.some((d) => d.name === "Dev Tunnels CLI")).toBe(true);
  });
});

describe("getInstallCommand", () => {
  it("returns correct commands per platform", () => {
    const dep = {
      install: {
        darwin: "brew install azure-cli",
        linux: "curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash",
        win32: "winget install -e --id Microsoft.AzureCLI",
      },
    };
    expect(getInstallCommand(dep, "darwin")).toBe("brew install azure-cli");
    expect(getInstallCommand(dep, "linux")).toContain("InstallAzureCLIDeb");
    expect(getInstallCommand(dep, "win32")).toContain("winget");
    expect(getInstallCommand(dep, "freebsd")).toBeNull();
  });
});
