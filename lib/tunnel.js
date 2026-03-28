// Tunnel detection, setup, and hosting (devtunnel, ngrok, cloudflared).

import { execSync, spawnSync } from "node:child_process";
import { commandExists } from "./detect.js";
import * as ui from "./ui.js";
import { loadState, saveState } from "./state.js";

export function detectTunnelProvider() {
  if (commandExists("devtunnel")) return "devtunnel";
  if (commandExists("ngrok")) return "ngrok";
  if (commandExists("cloudflared")) return "cloudflared";
  return null;
}

export async function setupTunnel(tunnelName, port = 3978) {
  const provider = detectTunnelProvider();
  if (!provider) {
    ui.error("No tunnel provider found. Install devtunnel, ngrok, or cloudflared.");
    process.exit(1);
  }

  const state = loadState();

  // Check for existing tunnel
  if (state.tunnelName && state.tunnelProvider === provider) {
    ui.success(`Tunnel "${state.tunnelName}" already configured (reusing)`);
    return { provider, tunnelName: state.tunnelName, tunnelUrl: state.tunnelUrl };
  }

  switch (provider) {
    case "devtunnel":
      return setupDevtunnel(tunnelName, port);
    case "ngrok":
      return setupNgrok(port);
    case "cloudflared":
      return setupCloudflared(port);
  }
}

async function setupDevtunnel(tunnelName, port) {
  // Ensure logged in
  let loggedIn = false;
  try {
    execSync("devtunnel user show", { stdio: "pipe" });
    loggedIn = true;
    ui.success("Dev Tunnels logged in");
  } catch {
    // Not logged in — need interactive login
  }

  if (!loggedIn) {
    ui.info("Logging in to Dev Tunnels...");
    const loginResult = spawnSync("devtunnel", ["user", "login", "--use-device-code"], {
      stdio: "inherit",
      shell: true,
    });
    if (loginResult.status !== 0) {
      // Try without device code as fallback
      const loginResult2 = spawnSync("devtunnel", ["user", "login"], {
        stdio: "inherit",
        shell: true,
      });
      if (loginResult2.status !== 0) {
        ui.error("Dev Tunnels login failed");
        ui.info("  Try: devtunnel user login");
        process.exit(1);
      }
    }
    ui.success("Dev Tunnels logged in");
  }

  // Create tunnel
  const spin2 = ui.spinner(`Creating tunnel "${tunnelName}"...`);
  spin2.start();
  try {
    // Delete existing tunnel with same name if any (idempotent)
    try {
      execSync(`devtunnel delete "${tunnelName}" --force`, { stdio: "pipe" });
    } catch {
      // didn't exist, that's fine
    }
    execSync(`devtunnel create "${tunnelName}" --allow-anonymous`, { stdio: "pipe" });
    execSync(`devtunnel port create "${tunnelName}" --port-number ${port}`, { stdio: "pipe" });
    spin2.succeed(`Tunnel "${tunnelName}" created`);
  } catch (err) {
    spin2.fail(`Failed to create tunnel "${tunnelName}"`);
    ui.info(`  Try: devtunnel create "${tunnelName}" --allow-anonymous`);
    throw err;
  }

  // Get URL — try multiple approaches since devtunnel output varies
  const tunnelUrl = getDevtunnelUrl(tunnelName, port);
  if (tunnelUrl) {
    ui.success(`Tunnel URL: ${tunnelUrl}`);
  } else {
    ui.warn("Could not determine tunnel URL yet. It will be captured when the tunnel starts.");
  }

  const result = { provider: "devtunnel", tunnelName, tunnelUrl };
  saveState({ tunnelProvider: "devtunnel", tunnelName, tunnelUrl });
  return result;
}

function extractUrlFromOutput(text) {
  const match = text.match(/https:\/\/\S+\.devtunnels\.\S+/);
  return match ? match[0].replace(/[",\s]+$/, "") : null;
}

function getDevtunnelUrl(tunnelName, port = 3978) {
  // Try plain text output first (most reliable — parse the URL from port listing)
  try {
    const raw = execSync(`devtunnel show "${tunnelName}"`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const url = extractUrlFromOutput(raw);
    if (url) return url;
  } catch { /* fall through */ }

  // Try JSON output
  try {
    const raw = execSync(`devtunnel show "${tunnelName}" --json`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const info = JSON.parse(raw);
    const url = info.tunnel?.uri || info.uri || extractUrlFromOutput(raw);
    if (url) return url;
  } catch { /* fall through */ }

  return null;
}

async function setupNgrok(port) {
  ui.info("Using ngrok (already installed).");
  ui.hint("Note: ngrok free tier gives a random URL that changes on restart.");
  const result = { provider: "ngrok", tunnelName: null, tunnelUrl: null };
  saveState({ tunnelProvider: "ngrok" });
  return result;
}

async function setupCloudflared(port) {
  ui.info("Using cloudflared (already installed).");
  const result = { provider: "cloudflared", tunnelName: null, tunnelUrl: null };
  saveState({ tunnelProvider: "cloudflared" });
  return result;
}

export async function hostTunnel(port = 3978) {
  const state = loadState();
  const provider = state.tunnelProvider || detectTunnelProvider();

  if (!provider) {
    ui.error("No tunnel provider configured. Run openclaw-teams-setup first.");
    process.exit(1);
  }

  console.log();
  ui.info(`Starting tunnel (${provider})...`);

  switch (provider) {
    case "devtunnel": {
      const name = state.tunnelName || "openclaw-teams";
      ui.info(`Tunnel: ${name}`);
      ui.info(`Forwarding to: localhost:${port}`);

      // Start hosting in background, wait for URL to appear, then update bot
      const { spawn } = await import("node:child_process");
      const host = spawn("devtunnel", ["host", name], {
        stdio: ["ignore", "pipe", "pipe"],
        shell: true,
      });

      // Capture URL from host output or by polling devtunnel show
      let tunnelUrl = state.tunnelUrl;
      if (!tunnelUrl) {
        ui.info("Waiting for tunnel URL...");
        // Poll for URL (it becomes available once hosting starts)
        for (let i = 0; i < 15; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          tunnelUrl = getDevtunnelUrl(name, port);
          if (tunnelUrl) break;
        }
      }

      if (tunnelUrl) {
        // Clean trailing slash
        tunnelUrl = tunnelUrl.replace(/\/+$/, "");
        saveState({ tunnelUrl });
        ui.success(`URL: ${tunnelUrl}`);

        // Update Azure bot endpoint
        if (state.botName && state.resourceGroup) {
          const endpoint = `${tunnelUrl}/api/messages`;
          try {
            execSync(
              `az bot update --name "${state.botName}" --resource-group "${state.resourceGroup}" ` +
                `--endpoint "${endpoint}" --output none`,
              { stdio: "pipe" },
            );
            ui.success(`Bot endpoint: ${endpoint}`);
          } catch {
            ui.warn("Could not update bot endpoint. Update manually in Azure Portal.");
          }
        }
      } else {
        ui.warn("Could not determine tunnel URL. Check: devtunnel show " + name);
      }

      console.log();
      ui.info("Tunnel is running. Press Ctrl+C to stop.");
      ui.info("Teams can reach your agent while this is running.");
      console.log();

      // Forward host output to stdout and wait for it to exit
      host.stdout.pipe(process.stdout);
      host.stderr.pipe(process.stderr);

      // Wait for the process to exit (Ctrl+C)
      await new Promise((resolve) => {
        host.on("close", resolve);
        process.on("SIGINT", () => {
          host.kill("SIGINT");
        });
      });
      break;
    }
    case "ngrok":
      ui.info(`Forwarding to: localhost:${port}`);
      console.log();
      ui.warn("Remember to update your bot's messaging endpoint with the ngrok URL.");
      console.log();
      spawnSync("ngrok", ["http", String(port)], { stdio: "inherit" });
      break;
    case "cloudflared":
      ui.info(`Forwarding to: localhost:${port}`);
      console.log();
      spawnSync("cloudflared", ["tunnel", "--url", `http://localhost:${port}`], { stdio: "inherit" });
      break;
  }
}

export function deleteTunnel() {
  const state = loadState();
  if (!state.tunnelName || state.tunnelProvider !== "devtunnel") {
    ui.hint("No dev tunnel to remove.");
    return;
  }

  const spin = ui.spinner(`Removing tunnel "${state.tunnelName}"...`);
  spin.start();
  try {
    execSync(`devtunnel delete "${state.tunnelName}" --force`, { stdio: "pipe" });
    spin.succeed(`Tunnel "${state.tunnelName}" removed`);
  } catch {
    spin.fail(`Failed to remove tunnel "${state.tunnelName}"`);
    ui.info(`  Try: devtunnel delete "${state.tunnelName}" --force`);
  }
}
