#!/usr/bin/env bash
# Layer 3: Provision an Azure VM for end-to-end testing.
#
# Run from your Mac:
#   bash test/e2e-setup.sh
#
# This creates a Standard_B2s Ubuntu 22.04 VM, installs Node.js,
# and copies the tool to the VM. Outputs the SSH command to connect.
#
# Teardown:
#   bash test/e2e-teardown.sh

set -euo pipefail

RG="${OPENCLAW_TEAMS_E2E_RG:-rg-openclaw-teams-e2e}"
VM="${OPENCLAW_TEAMS_E2E_VM:-openclaw-teams-e2e}"
LOCATION="${OPENCLAW_TEAMS_E2E_LOCATION:-eastus}"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== E2E Setup ==="
echo "Resource group: $RG"
echo "VM name:        $VM"
echo "Location:       $LOCATION"
echo ""

# Create resource group
echo "Creating resource group..."
az group create --name "$RG" --location "$LOCATION" --output none

# Create VM
echo "Creating VM (Standard_B2s, Ubuntu 22.04)..."
az vm create \
  --name "$VM" \
  --resource-group "$RG" \
  --image Ubuntu2204 \
  --size Standard_B2s \
  --admin-username tester \
  --generate-ssh-keys \
  --public-ip-sku Standard \
  --output none

# Get IP
IP=$(az vm show --name "$VM" --resource-group "$RG" -d --query publicIpAddress -o tsv)
echo "VM IP: $IP"

# Wait for SSH to be ready
echo "Waiting for SSH..."
for i in {1..30}; do
  if ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 "tester@$IP" true 2>/dev/null; then
    break
  fi
  sleep 2
done

# Install Node.js 22
echo "Installing Node.js 22..."
ssh "tester@$IP" 'curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash - && sudo apt-get install -y nodejs'

# Copy the tool to the VM
echo "Copying project to VM..."
rsync -az --exclude node_modules --exclude .git "$PROJECT_ROOT/" "tester@$IP:~/openclaw-teams-setup/"

# Install dependencies on VM
echo "Installing npm dependencies on VM..."
ssh "tester@$IP" 'cd ~/openclaw-teams-setup && npm install && sudo npm link'

echo ""
echo "=== VM Ready ==="
echo "SSH:   ssh tester@$IP"
echo "Tests: ssh tester@$IP 'bash ~/openclaw-teams-setup/test/e2e-run.sh'"
echo ""
echo "Saving VM IP to test/.e2e-vm-ip for other scripts..."
echo "$IP" > "$PROJECT_ROOT/test/.e2e-vm-ip"
