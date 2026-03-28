#!/usr/bin/env bash
# Layer 3: Tear down the E2E Azure VM and all test resources.
#
# Usage (from Mac):
#   bash test/e2e-teardown.sh

set -euo pipefail

RG="${OPENCLAW_TEAMS_E2E_RG:-rg-openclaw-teams-e2e}"
BOT_RG="${OPENCLAW_TEAMS_E2E_BOT_RG:-rg-openclaw-teams-e2e}"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== E2E Teardown ==="
echo ""

# Clean up leftover test bots
echo "Cleaning up test bots in $BOT_RG..."
BOTS=$(az resource list --resource-group "$BOT_RG" --resource-type "Microsoft.BotService/botServices" --query "[?starts_with(name, 'e2e-ots-')].name" -o tsv 2>/dev/null || true)
for BOT in $BOTS; do
  echo "  Deleting bot: $BOT"
  az bot delete --name "$BOT" --resource-group "$BOT_RG" --output none 2>/dev/null || true
done

# Clean up leftover test app registrations
echo "Cleaning up test app registrations..."
APPS=$(az ad app list --all --query "[?starts_with(displayName, 'e2e-ots-')].[appId, displayName]" -o tsv 2>/dev/null || true)
while IFS=$'\t' read -r APP_ID APP_NAME; do
  if [ -n "$APP_ID" ]; then
    echo "  Deleting app: $APP_NAME ($APP_ID)"
    az ad app delete --id "$APP_ID" --output none 2>/dev/null || true
  fi
done <<< "$APPS"

# Delete the resource group (includes VM, disks, NICs, etc.)
echo ""
echo "Deleting resource group $RG (async)..."
az group delete --name "$RG" --yes --no-wait 2>/dev/null || true

# Clean up local state
if [ -f "$PROJECT_ROOT/test/.e2e-vm-ip" ]; then
  rm "$PROJECT_ROOT/test/.e2e-vm-ip"
  echo "Removed test/.e2e-vm-ip"
fi

echo ""
echo "Done. Resource group deletion is running in the background."
echo "Check status: az group show --name $RG --query properties.provisioningState -o tsv"
