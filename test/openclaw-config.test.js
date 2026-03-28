import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { readConfig, mergeTeamsConfig, removeTeamsConfig, hasTeamsConfig } from "../lib/openclaw-config.js";

const TEST_DIR = path.join(os.tmpdir(), "openclaw-teams-test-" + process.pid);
const TEST_CONFIG = path.join(TEST_DIR, "openclaw.json");

beforeEach(() => {
  fs.mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("readConfig", () => {
  it("returns empty object for nonexistent file", () => {
    expect(readConfig("/tmp/nonexistent-config.json")).toEqual({});
  });

  it("parses valid JSON", () => {
    fs.writeFileSync(TEST_CONFIG, '{"foo": "bar"}');
    expect(readConfig(TEST_CONFIG)).toEqual({ foo: "bar" });
  });

  it("parses JSON5 with comments", () => {
    fs.writeFileSync(TEST_CONFIG, '{\n  // a comment\n  "foo": "bar",\n}');
    expect(readConfig(TEST_CONFIG)).toEqual({ foo: "bar" });
  });
});

describe("mergeTeamsConfig", () => {
  it("creates config from scratch when file doesn't exist", () => {
    mergeTeamsConfig(TEST_CONFIG, {
      appId: "test-app-id",
      appPassword: "test-password",
      tenantId: "test-tenant",
    });

    const config = readConfig(TEST_CONFIG);
    expect(config.channels.msteams.enabled).toBe(true);
    expect(config.channels.msteams.appId).toBe("test-app-id");
    expect(config.channels.msteams.appPassword).toBe("test-password");
    expect(config.channels.msteams.tenantId).toBe("test-tenant");
    expect(config.channels.msteams.webhook.port).toBe(3978);
    expect(config.channels.msteams.webhook.path).toBe("/api/messages");
  });

  it("preserves existing config keys", () => {
    fs.writeFileSync(
      TEST_CONFIG,
      JSON.stringify({
        agent: { name: "my-agent" },
        channels: { slack: { enabled: true } },
      }),
    );

    mergeTeamsConfig(TEST_CONFIG, {
      appId: "app-id",
      appPassword: "password",
      tenantId: "tenant",
    });

    const config = readConfig(TEST_CONFIG);
    expect(config.agent.name).toBe("my-agent");
    expect(config.channels.slack.enabled).toBe(true);
    expect(config.channels.msteams.enabled).toBe(true);
  });

  it("preserves existing msteams sub-keys", () => {
    fs.writeFileSync(
      TEST_CONFIG,
      JSON.stringify({
        channels: { msteams: { groupPolicy: "allowlist", requireMention: true } },
      }),
    );

    mergeTeamsConfig(TEST_CONFIG, {
      appId: "app-id",
      appPassword: "password",
      tenantId: "tenant",
    });

    const config = readConfig(TEST_CONFIG);
    expect(config.channels.msteams.groupPolicy).toBe("allowlist");
    expect(config.channels.msteams.requireMention).toBe(true);
    expect(config.channels.msteams.appId).toBe("app-id");
  });

  it("creates a backup of existing config", () => {
    fs.writeFileSync(TEST_CONFIG, '{"original": true}');

    mergeTeamsConfig(TEST_CONFIG, {
      appId: "app-id",
      appPassword: "password",
      tenantId: "tenant",
    });

    expect(fs.existsSync(TEST_CONFIG + ".bak")).toBe(true);
    const backup = JSON.parse(fs.readFileSync(TEST_CONFIG + ".bak", "utf-8"));
    expect(backup.original).toBe(true);
  });
});

describe("removeTeamsConfig", () => {
  it("removes msteams config", () => {
    fs.writeFileSync(
      TEST_CONFIG,
      JSON.stringify({
        channels: { msteams: { enabled: true }, slack: { enabled: true } },
      }),
    );

    const removed = removeTeamsConfig(TEST_CONFIG);
    expect(removed).toBe(true);

    const config = readConfig(TEST_CONFIG);
    expect(config.channels.msteams).toBeUndefined();
    expect(config.channels.slack.enabled).toBe(true);
  });

  it("returns false when no msteams config exists", () => {
    fs.writeFileSync(TEST_CONFIG, JSON.stringify({ channels: {} }));
    expect(removeTeamsConfig(TEST_CONFIG)).toBe(false);
  });
});

describe("hasTeamsConfig", () => {
  it("returns true when msteams is enabled", () => {
    fs.writeFileSync(
      TEST_CONFIG,
      JSON.stringify({ channels: { msteams: { enabled: true } } }),
    );
    expect(hasTeamsConfig(TEST_CONFIG)).toBe(true);
  });

  it("returns false when msteams is disabled", () => {
    fs.writeFileSync(
      TEST_CONFIG,
      JSON.stringify({ channels: { msteams: { enabled: false } } }),
    );
    expect(hasTeamsConfig(TEST_CONFIG)).toBe(false);
  });

  it("returns false for nonexistent file", () => {
    expect(hasTeamsConfig("/tmp/nonexistent-config.json")).toBe(false);
  });
});
