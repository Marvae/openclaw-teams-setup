# openclaw-teams-setup

One command to get an AI agent running in Microsoft Teams — with security sandboxing enabled by default.

Run `npx openclaw-teams-setup` whether you're starting from scratch or already have OpenClaw/NemoClaw running. The tool adapts to your setup.

## Problem

Getting an AI agent into Teams today is a multi-step obstacle course:
- If starting from scratch: install OpenClaw, figure out sandboxing, then do ~12 manual steps across Azure Portal, Teams Developer Portal, and the terminal.
- If you already have OpenClaw/NemoClaw: still ~12 manual steps for the Teams bot (30-45 minutes, error-prone).

This tool reduces everything to one command.

## Three Paths, One Command

The tool auto-detects your setup and takes the right path:

```
$ npx openclaw-teams-setup

  Checking your system...

  ┌─ Path A: NemoClaw found ──────────────────────────┐
  │  ✓ NemoClaw detected (sandbox "openclaw")          │
  │  → Skip to Teams setup                             │
  └────────────────────────────────────────────────────┘

  ┌─ Path B: OpenClaw found (no NemoClaw) ────────────┐
  │  ✓ OpenClaw detected                               │
  │  ⚠ Running without sandbox.                        │
  │    NemoClaw adds network policies, filesystem       │
  │    isolation, and tool restrictions.                 │
  │                                                     │
  │    [● Continue with OpenClaw as-is]                 │
  │    [○ Set up NemoClaw first (recommended)]          │
  └────────────────────────────────────────────────────┘

  ┌─ Path C: Nothing found ───────────────────────────┐
  │  No agent detected. Setting up NemoClaw            │
  │  (OpenClaw + security sandbox).                     │
  └────────────────────────────────────────────────────┘
```

### Path A: NemoClaw already installed → Teams setup only

```
$ npx openclaw-teams-setup

  ✓ NemoClaw detected (sandbox "openclaw")

  Step 1/3: Set up Azure Bot
  → Installing Azure CLI... ✓
  → Sign in to Azure (browser will open)... ✓
  → Creating bot "openclaw-teams"... ✓
  → Setting up tunnel... ✓

  Step 2/3: Configure OpenClaw
  → Installing @openclaw/msteams plugin... ✓
  → Writing config... ✓

  Step 3/3: Teams App
  → Generated: ~/Desktop/openclaw-teams-app.zip

  ✓ Upload the app to Teams and send a message!
```

### Path B: OpenClaw without NemoClaw → recommend upgrade, then Teams

```
$ npx openclaw-teams-setup

  ✓ OpenClaw detected

  ⚠ Your agent is running without a security sandbox.
    NemoClaw wraps OpenClaw with:
    • Network policies (controls what the agent can reach)
    • Filesystem isolation (agent can't access your files)
    • Tool restrictions (blocks dangerous commands by default)

    Set up NemoClaw first? (recommended) [Y/n] y

  Setting up NemoClaw...
  → Installing NemoClaw CLI... ✓
  → Running NemoClaw setup (this takes ~10 minutes)...

  (NemoClaw's onboard wizard runs: provider selection,
   sandbox creation, policy setup)

  ✓ NemoClaw ready

  Now connecting to Teams...
  (same as Path A from here)
```

If the user declines NemoClaw, the tool proceeds with plain OpenClaw — no judgment, no blocking.

### Path C: Starting from scratch → full setup

```
$ npx openclaw-teams-setup

  No agent detected. Let's set one up!

  This will install NemoClaw — an AI agent platform that runs
  on your machine with security sandboxing enabled by default.

  Continue? [Y/n] y

  Step 1/3: Set up NemoClaw
  → Installing NemoClaw CLI... ✓
  → Running NemoClaw setup...

    Choose your AI model:
      [● NVIDIA Nemotron (free, private)]
      [○ OpenAI GPT-4o]
      [○ Anthropic Claude]
      [○ Local (Ollama)]

    NVIDIA API key: ▊  (free at build.nvidia.com)

    Creating sandbox... ✓
    Applying security policies... ✓

  ✓ NemoClaw ready (sandbox "openclaw")

  Step 2/3: Connect to Teams
  → Installing Azure CLI... ✓
  → Sign in to Azure (browser will open)... ✓
  → Creating bot "openclaw-teams"... ✓
  → Setting up tunnel... ✓
  → Configuring OpenClaw... ✓

  Step 3/3: Teams App
  → Generated: ~/Desktop/openclaw-teams-app.zip

  ┌────────────────────────────────────────────────────┐
  │                                                      │
  │  Almost done! Upload the app to Teams:               │
  │                                                      │
  │  1. Open Microsoft Teams                             │
  │  2. Click "Apps" in the sidebar                      │
  │  3. Click "Manage your apps"                         │
  │  4. Click "Upload an app" → "Upload a custom app"   │
  │  5. Select: ~/Desktop/openclaw-teams-app.zip         │
  │                                                      │
  │  Then send the bot a message to test!                │
  │                                                      │
  │  To start the tunnel later:                          │
  │    npx openclaw-teams-setup --tunnel                 │
  │                                                      │
  └────────────────────────────────────────────────────┘
```

## Why NemoClaw by default

When the tool needs to install an agent, it installs **NemoClaw** (not raw OpenClaw) because:

- **OpenShell sandbox** — agent runs in an isolated environment with its own filesystem and network
- **Network policies** — agent can only reach explicitly allowed hosts (LLM APIs, etc.)
- **Tool restrictions** — dangerous tools (`exec`, `sudo`, `docker`) are blocked by default
- **Managed inference** — routes to NVIDIA, OpenAI, Anthropic, or local models
- **NemoClaw wraps OpenClaw** — you get all of OpenClaw's features (skills, channels, memory, cron) with security guardrails on top

Raw OpenClaw runs with full system access — fine for developers who understand the risks, but not what we want as the default for non-technical users.

## NemoClaw Installation

The tool delegates to NemoClaw's own installer and onboard wizard:

```js
async function installNemoClaw() {
  // NemoClaw's official installer (same one-liner from their docs)
  const installCmd = {
    darwin: 'curl -fsSL https://www.nvidia.com/nemoclaw.sh | bash',
    linux: 'curl -fsSL https://www.nvidia.com/nemoclaw.sh | bash',
    win32: 'powershell -c "irm https://www.nvidia.com/nemoclaw.ps1 | iex"',
  };

  await exec(installCmd[process.platform]);
}

async function onboardNemoClaw() {
  // Hand off to NemoClaw's interactive wizard
  // It handles: provider selection, API key, sandbox creation, policies
  await execInteractive('nemoclaw onboard');
}
```

**We do NOT reimplement NemoClaw's onboard logic.** Their wizard handles GPU detection, inference provider selection, sandbox creation, and policy setup. It's a polished 7-step flow with resume capability. We just install it and call it.

After onboard completes, our tool resumes with the Teams-specific steps.

## Design Principles

- **Auto-installs dependencies** — detects missing CLIs and offers to install them with one Y/n prompt. No "go to this website and download" instructions.
- **No runtime dependency on OpenClaw/NemoClaw internals** — shells out to `az`, `devtunnel`, and `openclaw` CLIs.
- **`npx` works immediately** — NemoClaw/OpenClaw users already have Node.js, so `npx openclaw-teams-setup` requires zero pre-installation.
- **Auto-detects your setup** — works with NemoClaw, plain OpenClaw, or a local `openclaw.json`.
- **Idempotent** — safe to re-run. Reuses existing bots, tunnels, and config if present.
- **Cross-platform** — macOS, Linux, Windows.
- **Graceful degradation** — if any automated step fails, prints the manual command so the user can do it themselves.

## Why npx + auto-install (and not a standalone binary)

We considered compiling to a single binary (via `bun build --compile`) to eliminate all dependencies. We rejected it because:

1. **Azure CLI handles auth edge cases we can't easily reimplement** — broker auth, Conditional Access, MFA, managed identity. Raw REST API calls with device code flow are blocked by many enterprise orgs.
2. **The tunnel needs a persistent process** — embedding a tunnel relay in a "setup" binary changes it from a run-once tool to a run-forever service.
3. **NemoClaw/OpenClaw users already have Node.js** — so `npx` works with zero additional installs. The dependency "problem" is already solved.
4. **Auto-installing `az` and `devtunnel` is one Y/n prompt** — much less effort than maintaining cross-platform compiled binaries.

## Prerequisites

The tool auto-detects and auto-installs almost everything. The user needs:

| Prerequisite | Required before running? | Notes |
|---|---|---|
| **Node.js 18+** | Yes | Needed for `npx`. If starting from scratch, install via `nvm` or nodejs.org. If OpenClaw/NemoClaw is already installed, Node.js is already present. |
| **Azure account** | Yes | Free tier works. Can't automate account creation. |
| **OpenClaw or NemoClaw** | Auto-installed | Tool installs NemoClaw if nothing is found |
| **Azure CLI** | Auto-installed | One Y/n prompt |
| **Dev Tunnels CLI** | Auto-installed | One Y/n prompt |

For the "starting from scratch" path (Path C), the only thing the user truly needs beforehand is **Node.js** and an **Azure account**. Everything else is handled.

## Auto-Install Logic

```js
async function ensureDependencies() {
  const missing = [];

  if (!commandExists('az')) missing.push({
    name: 'Azure CLI',
    why: 'creates your bot in Azure',
    install: {
      darwin: 'brew install azure-cli',
      linux: 'curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash',
      win32: 'winget install -e --id Microsoft.AzureCLI',
    },
  });

  if (!commandExists('devtunnel') && !commandExists('ngrok') && !commandExists('cloudflared')) {
    missing.push({
      name: 'Dev Tunnels CLI',
      why: 'connects Teams to your local agent',
      install: {
        darwin: 'curl -sL https://aka.ms/DevTunnelCliInstall | bash',
        linux: 'curl -sL https://aka.ms/DevTunnelCliInstall | bash',
        win32: 'winget install -e --id Microsoft.devtunnel',
      },
    });
  }

  if (missing.length === 0) return;

  console.log(`\n  I need to install ${missing.length} thing(s):`);
  for (const dep of missing) {
    console.log(`    • ${dep.name} — ${dep.why}`);
  }

  const ok = await confirm({ message: 'Install now?', default: true });
  if (!ok) {
    console.log('\n  To install manually:');
    for (const dep of missing) {
      console.log(`    ${dep.install[process.platform]}`);
    }
    process.exit(1);
  }

  for (const dep of missing) {
    await exec(dep.install[process.platform]);
  }
}
```

If the user declines, the tool prints the manual install commands and exits — never leaves them stuck.

## The 5 Steps (What the tool automates)

### Step 1: Azure Authentication

- Check if `az` is logged in (`az account show`)
- If not, run `az login` (opens browser for interactive sign-in)
- Extract tenant ID, subscription ID, logged-in user
- If multiple subscriptions, prompt to select one

### Step 2: Create Azure Bot

All via `az` CLI commands:

```bash
# Create resource group (if needed)
az group create --name rg-openclaw --location eastus

# Create app registration
az ad app create --display-name "openclaw-teams"
# → returns appId

# Create client secret
az ad app credential reset --id $APP_ID --years 2
# → returns password

# Create bot registration (free tier)
az bot create \
  --name "openclaw-teams" \
  --resource-group "rg-openclaw" \
  --app-type SingleTenant \
  --appid $APP_ID \
  --tenant-id $TENANT_ID \
  --sku F0

# Enable Teams channel
az bot msteams create \
  --name "openclaw-teams" \
  --resource-group "rg-openclaw"
```

**Idempotency:** Before creating, check if a bot with that name exists via `az bot show`. If so, reuse it and offer to rotate the secret.

### Step 3: Tunnel Setup

Auto-detect available tunnel provider. If none found, auto-install was already handled in the dependency check.

```
Detection order:
  1. devtunnel CLI → use it (user likely has MS account already)
  2. ngrok CLI     → use it (if already installed)
  3. cloudflared   → use it (if already installed)
```

**devtunnel (preferred):**
```bash
# Login (reuses Azure identity if possible)
devtunnel user login

# Create persistent named tunnel
devtunnel create openclaw-teams --allow-anonymous
devtunnel port create openclaw-teams --port-number 3978
```

After getting the tunnel URL, update the bot's messaging endpoint:
```bash
az bot update \
  --name "openclaw-teams" \
  --resource-group "rg-openclaw" \
  --endpoint "https://$TUNNEL_URL/api/messages"
```

**Note on tunnel hosting:** The tunnel needs a process running to relay traffic. The setup wizard does NOT start it as a background daemon — it tells the user how to start it:
```
To start the tunnel (run this whenever you want Teams connected):
  npx openclaw-teams-setup --tunnel

Or manually:
  devtunnel host openclaw-teams
```

This is a deliberate choice. A persistent tunnel is a service, not a setup step. Users should understand they need the tunnel running for Teams to reach their agent.

### Step 4: Configure OpenClaw

1. Install the msteams plugin (if not already installed):
   ```bash
   openclaw plugins install @openclaw/msteams
   ```

2. Read existing `openclaw.json`, merge in Teams config:
   ```json5
   {
     channels: {
       msteams: {
         enabled: true,
         appId: "<from step 2>",
         appPassword: "<from step 2>",
         tenantId: "<from step 1>",
         webhook: { port: 3978, path: "/api/messages" },
       },
     },
   }
   ```

3. If OpenClaw gateway is running, prompt user to restart it (or signal reload if supported).

### Step 5: Generate Teams App Package

Generate a valid Teams app manifest + icons + ZIP:

1. Fill `manifest.template.json` with bot ID, app name, description
2. Include bundled default icons (32x32 outline, 192x192 color)
3. Include RSC permissions for channel/group messaging:
   - `ChannelMessage.Read.Group` (Application)
   - `ChannelMessage.Send.Group` (Application)
   - `Member.Read.Group` (Application)
   - `ChatMessage.Read.Chat` (Application)
4. ZIP into `openclaw-teams-app.zip`, save to Desktop for easy access

Output clear upload instructions. This is the one step that can't be automated — there's no API for sideloading Teams apps.

## Additional Commands

```bash
npx openclaw-teams-setup                # Full setup wizard
npx openclaw-teams-setup --status       # Show current state (bot, tunnel, config)
npx openclaw-teams-setup --tunnel       # Start the tunnel (run whenever you want Teams connected)
npx openclaw-teams-setup --teardown     # Remove bot, tunnel, and config
npx openclaw-teams-setup --reconfigure  # Re-run just the config step
```

### --status

```
OpenClaw Teams Status
─────────────────────
Setup:     NemoClaw sandbox "openclaw" (running)
Bot:       openclaw-teams (App ID: 11111111-...) ✓
Tunnel:    devtunnel openclaw-teams → https://abc123.use2.devtunnels.ms ✓
Endpoint:  https://abc123.use2.devtunnels.ms/api/messages ✓
Plugin:    @openclaw/msteams installed ✓
Config:    msteams enabled in openclaw.json ✓
```

### --tunnel

Starts the tunnel in the foreground (Ctrl+C to stop):

```
$ npx openclaw-teams-setup --tunnel

  Starting tunnel "openclaw-teams"...
  URL: https://abc123.use2.devtunnels.ms
  Forwarding to: localhost:3978

  Tunnel is running. Press Ctrl+C to stop.
  Teams can reach your agent while this is running.
```

### --teardown

```
$ npx openclaw-teams-setup --teardown

  This will remove:
    • Azure Bot "openclaw-teams" and its app registration
    • Dev tunnel "openclaw-teams"
    • msteams config from openclaw.json (plugin stays installed)

  Continue? [y/N] y

  Removing bot... ✓
  Removing tunnel... ✓
  Removing config... ✓
  Done.
```

## Project Structure

```
openclaw-teams-setup/
├── package.json
├── bin/
│   └── cli.js                    # Entry point, arg parsing
├── lib/
│   ├── detect.js                 # Detect OpenClaw/NemoClaw/nothing, route to right path
│   ├── nemoclaw.js               # Install NemoClaw + run onboard wizard
│   ├── deps.js                   # Auto-detect and auto-install az + devtunnel
│   ├── azure-auth.js             # az login, extract tenant/subscription
│   ├── azure-bot.js              # Create/update/delete bot + app registration
│   ├── tunnel.js                 # Detect + setup + host devtunnel/ngrok/cloudflared
│   ├── openclaw-config.js        # Read/write openclaw.json (JSON5)
│   ├── manifest.js               # Generate Teams manifest + icons + ZIP
│   ├── status.js                 # --status command
│   ├── teardown.js               # --teardown command
│   └── ui.js                     # Console output helpers (colors, spinners, prompts)
├── templates/
│   ├── manifest.template.json    # Teams manifest with placeholders
│   ├── outline.png               # Default 32x32 bot icon
│   └── color.png                 # Default 192x192 bot icon
├── PLAN.md                       # This file
└── LICENSE
```

## package.json

```json
{
  "name": "openclaw-teams-setup",
  "version": "0.1.0",
  "description": "One-command Teams bot setup for OpenClaw and NemoClaw",
  "bin": {
    "openclaw-teams-setup": "./bin/cli.js"
  },
  "engines": {
    "node": ">=18"
  },
  "dependencies": {
    "@inquirer/prompts": "^7.0.0",
    "archiver": "^7.0.0",
    "json5": "^2.2.0",
    "ora": "^8.0.0",
    "chalk": "^5.0.0"
  },
  "keywords": ["openclaw", "nemoclaw", "teams", "microsoft-teams", "bot", "setup"],
  "license": "MIT"
}
```

## Dependencies

| Package | Why |
|---------|-----|
| `@inquirer/prompts` | Interactive prompts (bot name, resource group, install confirmation) |
| `archiver` | ZIP the Teams app manifest + icons |
| `json5` | Read/write openclaw.json (which uses JSON5 format) |
| `ora` | Spinner for long-running steps (az commands can take 10-30s) |
| `chalk` | Colored terminal output |

No OpenClaw/NemoClaw libraries imported. The tool only shells out to CLIs.

## Detection and Routing Logic

```js
async function detectAndRoute() {
  // Path A: NemoClaw found — best case, skip to Teams setup
  if (commandExists('nemoclaw')) {
    console.log('✓ NemoClaw detected');
    return {
      type: 'nemoclaw',
      configPath: path.join(os.homedir(), '.openclaw', 'openclaw.json'),
      pluginInstall: 'openclaw plugins install @openclaw/msteams',
    };
  }

  // Path B: OpenClaw found without NemoClaw — recommend upgrade
  if (commandExists('openclaw')) {
    console.log('✓ OpenClaw detected');
    console.log('⚠ Running without a security sandbox.');

    const upgrade = await select({
      message: 'What would you like to do?',
      choices: [
        { value: 'upgrade', name: 'Set up NemoClaw first (recommended — adds sandboxing)' },
        { value: 'continue', name: 'Continue with OpenClaw as-is' },
      ],
    });

    if (upgrade === 'upgrade') {
      await installNemoClaw();
      await onboardNemoClaw();
    }

    return {
      type: upgrade === 'upgrade' ? 'nemoclaw' : 'openclaw',
      configPath: path.join(os.homedir(), '.openclaw', 'openclaw.json'),
      pluginInstall: 'openclaw plugins install @openclaw/msteams',
    };
  }

  // Path C: Nothing found — install NemoClaw from scratch
  console.log('No agent detected. Setting up NemoClaw (OpenClaw + security sandbox).');

  const ok = await confirm({ message: 'Continue?', default: true });
  if (!ok) process.exit(0);

  await installNemoClaw();
  await onboardNemoClaw();

  return {
    type: 'nemoclaw',
    configPath: path.join(os.homedir(), '.openclaw', 'openclaw.json'),
    pluginInstall: 'openclaw plugins install @openclaw/msteams',
  };
}
```

## Tunnel Provider Details

### devtunnel (default, auto-installed if nothing present)

- **Auth**: GitHub, MSA, or Entra ID (all free)
- **Limits**: 10 tunnels, 5GB bandwidth (plenty for bot traffic — a full day of chatting is ~10-50MB)
- **Persistent URL**: Yes, with named tunnels
- **Auto-install**:
  - macOS/Linux: `curl -sL https://aka.ms/DevTunnelCliInstall | bash`
  - Windows: `winget install -e --id Microsoft.devtunnel`

### ngrok (used if already installed)

- **Auth**: ngrok account (free tier)
- **Limits**: 1 tunnel, rate limited on free tier
- **Persistent URL**: Paid only ($8/mo)

### cloudflared (used if already installed)

- **Auth**: Cloudflare account (free)
- **Limits**: Generous free tier
- **Persistent URL**: Yes, with DNS setup

The tool prefers whatever is already installed. Only auto-installs devtunnel if nothing is present.

## Error Handling

The tool never leaves the user stuck. Every failure has a recovery path:

| Failure | What the tool does |
|---------|-------------------|
| Nothing installed, user declines NemoClaw | Prints manual install commands for NemoClaw and OpenClaw, exits |
| NemoClaw install fails | Prints the one-liner install command, common fixes (network, permissions) |
| `nemoclaw onboard` fails mid-way | NemoClaw has built-in resume — tells user to run `nemoclaw onboard` to continue |
| User declines dep install | Prints manual install commands, exits |
| `az login` fails | Prints the manual command to try, common fixes |
| No Azure subscription | Links to free Azure account creation |
| Bot name already taken | Suggests alternative name with random suffix, retries |
| `az bot create` fails (permissions) | Prints what permissions are needed, suggests asking IT admin |
| Tunnel creation fails | Prints manual tunnel setup for all 3 providers |
| Plugin install fails | Prints the manual `openclaw plugins install` command |
| Config file is read-only | Prints the JSON5 snippet to add manually |
| Config merge conflicts | Backs up existing config before writing, prints diff |

## State Persistence

The tool saves its state to `~/.openclaw-teams-setup.json` so it can be idempotent:

```json
{
  "botName": "openclaw-teams",
  "resourceGroup": "rg-openclaw",
  "appId": "11111111-...",
  "tenantId": "72f988bf-...",
  "tunnelProvider": "devtunnel",
  "tunnelName": "openclaw-teams",
  "tunnelUrl": "https://abc123.use2.devtunnels.ms",
  "configPath": "~/.openclaw/openclaw.json",
  "createdAt": "2026-03-27T10:00:00Z"
}
```

On re-run, the tool detects existing resources and skips/reuses them:
```
  Step 2/5: Creating Azure Bot
  → Bot "openclaw-teams" already exists ✓ (reusing)
  → Rotate client secret? [y/N] n
```

## Testing Strategy

Four layers, from fast/local to slow/full-integration.

### Layer 1: Unit tests (local, no infra)

Tests the logic that doesn't need real Azure, NemoClaw, or tunnels. Runs with `vitest`, no network.

**What's covered:**
| Module | What to test |
|--------|-------------|
| `detect.js` | Mock which commands exist on PATH → verify correct path (A/B/C) chosen |
| `deps.js` | Mock `process.platform` → verify correct install commands generated per OS |
| `manifest.js` | Generate a real ZIP → unzip it → validate `manifest.json` against Teams schema |
| `openclaw-config.js` | Read existing JSON5 → merge msteams config → verify output preserves existing keys |
| `nemoclaw.js` | Mock `exec` → verify correct install one-liner per platform |
| `ui.js` | Output formatting (snapshot tests) |

```bash
npm test                # runs all unit tests
npm test -- --watch     # re-run on file change during development
```

**Covers ~40% of the code** — all the pure logic that doesn't touch external systems.

### Layer 2: Azure CLI integration tests (local Mac, real Azure)

Tests bot creation, update, and teardown against a real Azure subscription. No NemoClaw or VM needed.

```bash
# Setup: dedicated test resource group
export OPENCLAW_TEAMS_TEST_RG="rg-openclaw-teams-test"
az group create --name $OPENCLAW_TEAMS_TEST_RG --location eastus

# Test bot lifecycle
npm run test:azure
# → creates bot "test-openclaw-teams-<random>"
# → verifies bot exists via az bot show
# → updates messaging endpoint
# → tears down bot
# → verifies resource group is clean

# Cleanup
az group delete --name $OPENCLAW_TEAMS_TEST_RG --yes --no-wait
```

**Key things to test:**
- Bot creation succeeds on free tier
- Idempotency: re-running doesn't create a duplicate
- Bot name collision → generates alternative name
- Teardown removes both bot and app registration
- Secret rotation updates config file

### Layer 3: End-to-end on Azure VM

A Linux VM for testing the complete flows. Each path gets a clean environment.

**VM setup script (run from your Mac):**

```bash
#!/bin/bash
# test/e2e-setup.sh

RG="rg-openclaw-teams-e2e"
VM="openclaw-teams-e2e"
LOCATION="eastus"

# Create resource group + VM
az group create --name $RG --location $LOCATION
az vm create \
  --name $VM \
  --resource-group $RG \
  --image Ubuntu2204 \
  --size Standard_B2s \
  --admin-username tester \
  --generate-ssh-keys \
  --public-ip-sku Standard

IP=$(az vm show --name $VM --resource-group $RG -d --query publicIpAddress -o tsv)
echo "VM IP: $IP"

# Install Node.js (the one real prereq)
ssh tester@$IP 'curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash - && sudo apt-get install -y nodejs'

# Copy the tool to the VM (or install from npm if published)
scp -r . tester@$IP:~/openclaw-teams-setup/
ssh tester@$IP 'cd ~/openclaw-teams-setup && npm install && npm link'

echo "Ready. SSH in with: ssh tester@$IP"
```

**Test Path C (nothing installed):**
```bash
ssh tester@$IP

# Verify clean state
which nemoclaw  # should not exist
which openclaw  # should not exist

# Run the tool — should install NemoClaw, onboard, then do Teams setup
openclaw-teams-setup --non-interactive --yes

# Verify
nemoclaw status                          # NemoClaw running
openclaw-teams-setup --status            # bot + tunnel + config all ✓
```

**Test Path A (NemoClaw pre-installed):**
```bash
# Snapshot the VM after NemoClaw is installed (from Path C test above)
az vm deallocate --name $VM --resource-group $RG
az snapshot create --name snap-nemoclaw-ready --resource-group $RG --source $VM

# Restore snapshot, teardown just the Teams parts
openclaw-teams-setup --teardown --yes

# Re-run — should skip NemoClaw install, go straight to Teams
openclaw-teams-setup --non-interactive --yes
```

**Test Path B (OpenClaw without NemoClaw):**
```bash
# Start from a bare VM, install only OpenClaw
ssh tester@$IP 'npm install -g openclaw@latest && openclaw onboard --install-daemon'

# Run the tool — should recommend NemoClaw upgrade
openclaw-teams-setup
# → verify it shows the upgrade prompt
# → test both choices: upgrade and continue without
```

**Teardown everything:**
```bash
az group delete --name $RG --yes --no-wait
```

### Layer 4: Cross-platform spot checks

Not every release, but periodically:

| Platform | How | When |
|----------|-----|------|
| **macOS** | Run locally on your Mac | Every change (it's your dev machine) |
| **Linux (Ubuntu)** | Azure VM (Layer 3) | Before each release |
| **Linux (other)** | Quick test in Docker: `docker run -it ubuntu:22.04 bash` | If users report issues |
| **Windows** | Azure VM with Windows 11 + WSL2, or GitHub Actions | Before v1.0 |

### CI: GitHub Actions

Automate Layers 1 and 2 on every push:

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]

jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: npm ci
      - run: npm test

  azure-integration:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'  # only on main, not PRs
    environment: azure-test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - uses: azure/login@v2
        with:
          creds: ${{ secrets.AZURE_CREDENTIALS }}
      - run: npm ci
      - run: npm run test:azure
      - run: npm run test:azure:teardown  # always clean up
```

Layer 3 (E2E on VM) stays manual — it involves interactive NemoClaw onboarding and costs real Azure VM time. Run it before releases.

### Test matrix summary

| Layer | What | Where | Speed | When |
|-------|------|-------|-------|------|
| **1. Unit** | Detection, config merge, manifest gen | Local / CI | ~5 sec | Every push |
| **2. Azure integration** | Bot create/update/teardown | Local / CI (main only) | ~2 min | Every push to main |
| **3. E2E full paths** | Path A/B/C on real Linux VM | Azure VM | ~20 min | Before releases |
| **4. Cross-platform** | Windows, other Linux distros | Various | ~30 min | Periodically |

## Future Enhancements

| Enhancement | Description |
|---|---|
| **`--non-interactive`** | Flags for CI/scripting: `--bot-name X`, `--resource-group Y`, `--yes` |
| **Tunnel auto-start on boot** | `--install-service` generates launchd/systemd/Task Scheduler entry |
| **Health check** | `--status` pings the bot endpoint and reports if webhook is reachable |
| **Secret rotation** | `--rotate-secret` creates new client secret, updates config + Azure |
| **Custom icons** | `--icon ./my-bot-icon.png` for branded Teams app |
| **Admin consent helper** | Guided flow for Graph API permissions (channel files, message history) |
| **Teams Developer Portal** | `--open-portal` opens the browser to upload the app |
