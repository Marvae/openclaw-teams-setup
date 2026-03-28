// Auto-detect and auto-install external dependencies (az CLI, devtunnel).

import { execSync } from "node:child_process";
import { commandExists } from "./detect.js";
import * as ui from "./ui.js";

const DEPS = [
  {
    name: "Azure CLI",
    cmd: "az",
    why: "creates your bot in Azure",
    install: {
      darwin: commandExists("brew")
        ? "brew install azure-cli"
        : 'pip3 install --user azure-cli && export PATH="$HOME/Library/Python/3.9/bin:$HOME/.local/bin:$PATH"',
      linux: "curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash",
      win32: "winget install -e --id Microsoft.AzureCLI",
    },
    postInstallPaths: {
      darwin: ["Library/Python/3.9/bin", "Library/Python/3.10/bin", "Library/Python/3.11/bin", "Library/Python/3.12/bin", "Library/Python/3.13/bin", ".local/bin"],
    },
  },
  {
    name: "Dev Tunnels CLI",
    cmd: "devtunnel",
    alternates: ["ngrok", "cloudflared"],
    why: "connects Teams to your local agent",
    install: {
      darwin: "curl -sL https://aka.ms/DevTunnelCliInstall | bash",
      linux: "curl -sL https://aka.ms/DevTunnelCliInstall | bash",
      win32: "winget install -e --id Microsoft.devtunnel",
    },
  },
];

export function getMissingDeps() {
  const missing = [];
  for (const dep of DEPS) {
    if (commandExists(dep.cmd)) continue;
    if (dep.alternates && dep.alternates.some((a) => commandExists(a))) continue;
    missing.push(dep);
  }
  return missing;
}

export function getInstallCommand(dep, platform) {
  return dep.install[platform] || null;
}

export async function ensureDependencies() {
  const missing = getMissingDeps();
  if (missing.length === 0) return;

  console.log();
  ui.info(`I need to install ${missing.length} thing(s):`);
  for (const dep of missing) {
    ui.info(`  • ${dep.name} — ${dep.why}`);
  }
  console.log();

  const ok = await ui.confirm("Install now?", true);
  if (!ok) {
    console.log();
    ui.info("To install manually:");
    for (const dep of missing) {
      const cmd = getInstallCommand(dep, process.platform);
      if (cmd) ui.info(`  ${cmd}`);
    }
    process.exit(1);
  }

  for (const dep of missing) {
    const cmd = getInstallCommand(dep, process.platform);
    if (!cmd) {
      ui.error(`No install command for ${dep.name} on ${process.platform}`);
      process.exit(1);
    }

    ui.info(`Installing ${dep.name}...`);
    try {
      execSync(cmd, { stdio: "inherit", shell: true });
      // Add common install locations to PATH for the current process
      const home = process.env.HOME || "";
      const extraPaths = [
        `${home}/.devtunnel/bin`,
        `${home}/bin`,
        "/usr/local/bin",
        "/opt/homebrew/bin",
      ];
      // Add dep-specific post-install paths
      const depPaths = dep.postInstallPaths?.[process.platform] || [];
      for (const p of depPaths) {
        extraPaths.push(`${home}/${p}`);
      }
      process.env.PATH = extraPaths.join(":") + ":" + process.env.PATH;
      ui.success(`${dep.name} installed`);
    } catch (err) {
      ui.error(`${dep.name} installation failed`);
      ui.info(`  Try manually: ${cmd}`);
      process.exit(1);
    }
  }
}
