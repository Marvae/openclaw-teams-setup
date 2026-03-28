// Generate Teams app manifest (manifest.json + icons) and ZIP it.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createWriteStream } from "node:fs";
import archiver from "archiver";
import * as ui from "./ui.js";

const TEMPLATES_DIR = path.join(import.meta.dirname, "..", "templates");

export function getTemplateDir() {
  return TEMPLATES_DIR;
}

export function generateManifest({ appId, botName, developerName = "OpenClaw" }) {
  const templatePath = path.join(TEMPLATES_DIR, "manifest.template.json");
  let template = fs.readFileSync(templatePath, "utf-8");

  template = template.replace(/\{\{APP_ID\}\}/g, appId);
  template = template.replace(/\{\{BOT_NAME\}\}/g, botName);
  template = template.replace(/\{\{DEVELOPER_NAME\}\}/g, developerName);

  return JSON.parse(template);
}

export async function createAppPackage({ appId, botName, developerName = "OpenClaw", outputDir }) {
  if (!outputDir) {
    outputDir = path.join(os.homedir(), "Desktop");
    // Fall back to home dir if Desktop doesn't exist
    if (!fs.existsSync(outputDir)) {
      outputDir = os.homedir();
    }
  }

  const manifest = generateManifest({ appId, botName, developerName });
  const outputPath = path.join(outputDir, "openclaw-teams-app.zip");

  const spin = ui.spinner("Generating Teams app package...");
  spin.start();

  try {
    await new Promise((resolve, reject) => {
      const output = createWriteStream(outputPath);
      const archive = archiver("zip", { zlib: { level: 9 } });

      output.on("close", resolve);
      archive.on("error", reject);

      archive.pipe(output);
      archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });
      archive.file(path.join(TEMPLATES_DIR, "outline.png"), { name: "outline.png" });
      archive.file(path.join(TEMPLATES_DIR, "color.png"), { name: "color.png" });
      archive.finalize();
    });

    spin.succeed(`Teams app package: ${outputPath}`);
    return outputPath;
  } catch (err) {
    spin.fail("Failed to create app package");
    throw err;
  }
}
