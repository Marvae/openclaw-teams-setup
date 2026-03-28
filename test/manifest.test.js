import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import { generateManifest, createAppPackage, getTemplateDir } from "../lib/manifest.js";

describe("generateManifest", () => {
  it("fills in all placeholders", () => {
    const manifest = generateManifest({
      appId: "11111111-1111-1111-1111-111111111111",
      botName: "test-bot",
      developerName: "Test Org",
    });

    expect(manifest.id).toBe("11111111-1111-1111-1111-111111111111");
    expect(manifest.name.short).toBe("test-bot");
    expect(manifest.developer.name).toBe("Test Org");
    expect(manifest.bots[0].botId).toBe("11111111-1111-1111-1111-111111111111");
    expect(manifest.webApplicationInfo.id).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("includes required Teams manifest fields", () => {
    const manifest = generateManifest({
      appId: "test-id",
      botName: "test-bot",
    });

    expect(manifest.$schema).toContain("MicrosoftTeams.schema.json");
    expect(manifest.manifestVersion).toBe("1.23");
    expect(manifest.version).toBe("1.0.0");
    expect(manifest.icons.outline).toBe("outline.png");
    expect(manifest.icons.color).toBe("color.png");
  });

  it("includes correct bot scopes", () => {
    const manifest = generateManifest({ appId: "x", botName: "y" });
    const scopes = manifest.bots[0].scopes;
    expect(scopes).toContain("personal");
    expect(scopes).toContain("team");
    expect(scopes).toContain("groupChat");
  });

  it("includes RSC permissions", () => {
    const manifest = generateManifest({ appId: "x", botName: "y" });
    const perms = manifest.authorization.permissions.resourceSpecific;
    const names = perms.map((p) => p.name);

    expect(names).toContain("ChannelMessage.Read.Group");
    expect(names).toContain("ChannelMessage.Send.Group");
    expect(names).toContain("Member.Read.Group");
    expect(names).toContain("ChatMessage.Read.Chat");
    expect(perms.every((p) => p.type === "Application")).toBe(true);
  });

  it("sets supportsFiles to true", () => {
    const manifest = generateManifest({ appId: "x", botName: "y" });
    expect(manifest.bots[0].supportsFiles).toBe(true);
  });
});

describe("createAppPackage", () => {
  it("creates a valid ZIP with manifest.json and icons", async () => {
    const outputDir = path.join(os.tmpdir(), "openclaw-teams-zip-test-" + process.pid);
    fs.mkdirSync(outputDir, { recursive: true });

    try {
      const zipPath = await createAppPackage({
        appId: "test-app-id",
        botName: "test-bot",
        outputDir,
      });

      expect(fs.existsSync(zipPath)).toBe(true);

      // Unzip and verify contents
      const unzipDir = path.join(outputDir, "unzipped");
      fs.mkdirSync(unzipDir);
      execSync(`unzip -o "${zipPath}" -d "${unzipDir}"`);

      // Check files exist
      expect(fs.existsSync(path.join(unzipDir, "manifest.json"))).toBe(true);
      expect(fs.existsSync(path.join(unzipDir, "outline.png"))).toBe(true);
      expect(fs.existsSync(path.join(unzipDir, "color.png"))).toBe(true);

      // Validate manifest content
      const manifest = JSON.parse(fs.readFileSync(path.join(unzipDir, "manifest.json"), "utf-8"));
      expect(manifest.id).toBe("test-app-id");
      expect(manifest.bots[0].botId).toBe("test-app-id");

      // Validate icons are real PNGs (check PNG magic bytes)
      const outline = fs.readFileSync(path.join(unzipDir, "outline.png"));
      expect(outline[0]).toBe(137); // PNG signature
      expect(outline[1]).toBe(80);  // P
      expect(outline[2]).toBe(78);  // N
      expect(outline[3]).toBe(71);  // G
    } finally {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  });
});

describe("template icons exist", () => {
  it("has outline.png and color.png in templates dir", () => {
    const dir = getTemplateDir();
    expect(fs.existsSync(path.join(dir, "outline.png"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "color.png"))).toBe(true);
  });
});
