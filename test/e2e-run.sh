#!/usr/bin/env bash
# Layer 3: Run end-to-end tests on the Azure VM.
#
# This script runs directly on the VM (or via SSH from your Mac).
# It tests all three paths and the auxiliary commands.
#
# Usage (on VM):
#   bash ~/openclaw-teams-setup/test/e2e-run.sh
#
# Usage (from Mac):
#   IP=$(cat test/.e2e-vm-ip)
#   ssh tester@$IP 'bash ~/openclaw-teams-setup/test/e2e-run.sh'
#
# Requires: az login on the VM (for bot creation steps).

set -euo pipefail

PASS=0
FAIL=0
ERRORS=""

pass() {
  echo "  ✓ $1"
  PASS=$((PASS + 1))
}

fail() {
  echo "  ✗ $1"
  FAIL=$((FAIL + 1))
  ERRORS="$ERRORS\n  - $1"
}

check() {
  local desc="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    pass "$desc"
  else
    fail "$desc"
  fi
}

echo ""
echo "=== E2E Tests ==="
echo ""

# ─── Prerequisite checks ─────────────────────────────────────────

echo "Prerequisites:"
check "Node.js is installed"    node --version
check "npm is installed"        npm --version
check "CLI is linked"           which openclaw-teams-setup
check "az CLI is installed"     az --version

# Check az login
if az account show >/dev/null 2>&1; then
  pass "az CLI is logged in"
else
  fail "az CLI not logged in — run: az login"
  echo ""
  echo "Cannot continue without Azure login."
  exit 1
fi

echo ""

# ─── Path C: Nothing installed (fresh start) ─────────────────────

echo "Path C: Fresh start (no agent installed)"

# Verify clean state — neither nemoclaw nor openclaw should exist
# on a fresh VM (unless a previous test installed them)
if ! which nemoclaw >/dev/null 2>&1 && ! which openclaw >/dev/null 2>&1; then
  pass "Clean state — no agent installed"
else
  echo "  ⚠ Agent already installed — skipping Path C (run on fresh VM)"
fi

# We can't fully test Path C non-interactively without NemoClaw's
# installer being available. Test the detection logic instead.
echo "  (Path C full test requires interactive NemoClaw onboarding)"
echo ""

# ─── Path A: NemoClaw installed ──────────────────────────────────

echo "Path A: NemoClaw detection"

if which nemoclaw >/dev/null 2>&1; then
  pass "NemoClaw is on PATH"

  # Test --status (should detect NemoClaw)
  OUTPUT=$(openclaw-teams-setup --status 2>&1 || true)
  if echo "$OUTPUT" | grep -q "NemoClaw"; then
    pass "--status detects NemoClaw"
  else
    fail "--status does not detect NemoClaw"
  fi
else
  echo "  ⚠ NemoClaw not installed — skipping Path A tests"
fi

echo ""

# ─── Path B: OpenClaw without NemoClaw ───────────────────────────

echo "Path B: OpenClaw-only detection"

if which openclaw >/dev/null 2>&1 && ! which nemoclaw >/dev/null 2>&1; then
  pass "OpenClaw on PATH, NemoClaw absent"

  OUTPUT=$(openclaw-teams-setup --status 2>&1 || true)
  if echo "$OUTPUT" | grep -q "OpenClaw"; then
    pass "--status detects OpenClaw"
  else
    fail "--status does not detect OpenClaw"
  fi
else
  echo "  ⚠ Requires OpenClaw without NemoClaw — skipping Path B tests"
fi

echo ""

# ─── Azure Bot lifecycle (non-interactive subset) ────────────────

echo "Azure Bot lifecycle:"

SUFFIX=$(head -c 4 /dev/urandom | xxd -p)
TEST_BOT="e2e-ots-${SUFFIX}"
TEST_RG="${OPENCLAW_TEAMS_E2E_BOT_RG:-rg-openclaw-teams-e2e}"
TENANT_ID=$(az account show --query tenantId -o tsv)

# Ensure resource group
az group create --name "$TEST_RG" --location eastus --output none 2>/dev/null
pass "Resource group ready"

# Create app registration
APP_ID=$(az ad app create --display-name "$TEST_BOT" --query appId -o tsv 2>/dev/null)
if [ -n "$APP_ID" ]; then
  pass "App registration created ($APP_ID)"
else
  fail "App registration creation failed"
fi

# Create secret
APP_PASSWORD=$(az ad app credential reset --id "$APP_ID" --years 1 --query password -o tsv 2>/dev/null)
if [ -n "$APP_PASSWORD" ]; then
  pass "Client secret created"
else
  fail "Client secret creation failed"
fi

# Create bot
if az bot create --name "$TEST_BOT" --resource-group "$TEST_RG" \
  --app-type SingleTenant --appid "$APP_ID" --tenant-id "$TENANT_ID" \
  --sku F0 --output none 2>/dev/null; then
  pass "Bot created ($TEST_BOT)"
else
  fail "Bot creation failed"
fi

# Enable Teams channel
if az bot msteams create --name "$TEST_BOT" --resource-group "$TEST_RG" --output none 2>/dev/null; then
  pass "Teams channel enabled"
else
  fail "Teams channel enable failed"
fi

# Update endpoint
ENDPOINT="https://test-e2e.devtunnels.ms/api/messages"
if az bot update --name "$TEST_BOT" --resource-group "$TEST_RG" \
  --endpoint "$ENDPOINT" --output none 2>/dev/null; then
  pass "Endpoint updated"
else
  fail "Endpoint update failed"
fi

# Verify endpoint
ACTUAL=$(az bot show --name "$TEST_BOT" --resource-group "$TEST_RG" \
  --query properties.endpoint -o tsv 2>/dev/null)
if [ "$ACTUAL" = "$ENDPOINT" ]; then
  pass "Endpoint verified ($ACTUAL)"
else
  fail "Endpoint mismatch: expected $ENDPOINT, got $ACTUAL"
fi

# Teardown bot
if az bot delete --name "$TEST_BOT" --resource-group "$TEST_RG" --output none 2>/dev/null; then
  pass "Bot deleted"
else
  fail "Bot deletion failed"
fi

# Teardown app registration
if az ad app delete --id "$APP_ID" --output none 2>/dev/null; then
  pass "App registration deleted"
else
  fail "App registration deletion failed"
fi

# Verify bot is gone
if ! az bot show --name "$TEST_BOT" --resource-group "$TEST_RG" --output none 2>/dev/null; then
  pass "Bot confirmed gone"
else
  fail "Bot still exists after deletion"
fi

echo ""

# ─── Manifest generation ─────────────────────────────────────────

echo "Manifest generation (on-VM):"

# Use the CLI's --help to verify it loads without errors
if openclaw-teams-setup --help >/dev/null 2>&1; then
  pass "CLI loads without errors"
else
  fail "CLI failed to load"
fi

echo ""

# ─── --teardown on empty state ───────────────────────────────────

echo "Auxiliary commands:"

OUTPUT=$(openclaw-teams-setup --teardown 2>&1 </dev/null || true)
if echo "$OUTPUT" | grep -qi "nothing to tear down\|no previous setup"; then
  pass "--teardown on empty state is safe"
else
  fail "--teardown on empty state gave unexpected output"
fi

echo ""

# ─── Summary ─────────────────────────────────────────────────────

echo "=== Results ==="
echo "  Passed: $PASS"
echo "  Failed: $FAIL"

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "  Failures:"
  echo -e "$ERRORS"
  echo ""
  exit 1
fi

echo ""
echo "  All tests passed."
