import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock child_process before importing detect
vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
  execSync: vi.fn(),
  spawnSync: vi.fn(() => ({ status: 0 })),
}));

// Mock ui to suppress output
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
  isAutoAccept: vi.fn(() => false),
  setAutoAccept: vi.fn(),
}));

// Mock nemoclaw
vi.mock("../lib/nemoclaw.js", () => ({
  installNemoClaw: vi.fn(),
  onboardNemoClaw: vi.fn(),
}));

import { execFileSync } from "node:child_process";
import { commandExists, detectAndRoute } from "../lib/detect.js";
import * as uiMock from "../lib/ui.js";

describe("commandExists", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when command is found", () => {
    execFileSync.mockReturnValue("");
    expect(commandExists("node")).toBe(true);
  });

  it("returns false when command is not found", () => {
    execFileSync.mockImplementation(() => {
      throw new Error("not found");
    });
    expect(commandExists("nonexistent-xyz")).toBe(false);
  });
});

describe("detectAndRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns nemoclaw path when nemoclaw is found (Path A)", async () => {
    // nemoclaw exists
    execFileSync.mockImplementation((cmd, args) => {
      if (args[0] === "nemoclaw") return "";
      throw new Error("not found");
    });

    const result = await detectAndRoute();
    expect(result.type).toBe("nemoclaw");
    expect(result.configPath).toContain("openclaw.json");
  });

  it("returns openclaw path when user declines upgrade (Path B)", async () => {
    // openclaw exists, nemoclaw doesn't
    execFileSync.mockImplementation((cmd, args) => {
      if (args[0] === "openclaw") return "";
      throw new Error("not found");
    });
    uiMock.select.mockResolvedValue("continue");

    const result = await detectAndRoute();
    expect(result.type).toBe("openclaw");
  });

  it("returns nemoclaw path when user accepts upgrade (Path B → upgrade)", async () => {
    execFileSync.mockImplementation((cmd, args) => {
      if (args[0] === "openclaw") return "";
      throw new Error("not found");
    });
    uiMock.select.mockResolvedValue("upgrade");

    const result = await detectAndRoute();
    expect(result.type).toBe("nemoclaw");
  });

  it("installs NemoClaw from scratch when nothing found (Path C)", async () => {
    execFileSync.mockImplementation(() => {
      throw new Error("not found");
    });
    uiMock.confirm.mockResolvedValue(true);

    const { installNemoClaw, onboardNemoClaw } = await import("../lib/nemoclaw.js");

    const result = await detectAndRoute();
    expect(result.type).toBe("nemoclaw");
    expect(installNemoClaw).toHaveBeenCalled();
    expect(onboardNemoClaw).toHaveBeenCalled();
  });
});
