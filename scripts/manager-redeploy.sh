#!/bin/bash
# Force a clean redeploy of a manager environment
# Use this when a deployment becomes corrupted (e.g., chunk load errors, hash mismatches)
#
# Usage: manager-redeploy.sh <env>
# Example: manager-redeploy.sh dev
#
# Install location on EC2: /home/admin/scripts/manager-redeploy.sh

set -e

if [ -z "$1" ]; then
    echo "Usage: $0 <env>"
    echo "  env: dev, preview, or prod"
    exit 1
fi

ENV=$1
PM2_NAME="manager-${ENV}"
APP_DIR="/home/admin/apps/${PM2_NAME}"

# Validate environment
if [[ ! "$ENV" =~ ^(dev|preview|prod)$ ]]; then
    echo "Error: env must be one of: dev, preview, prod"
    exit 1
fi

echo "Force redeploying ${PM2_NAME}..."

# Stop the PM2 process
echo "Stopping PM2 process..."
pm2 delete "$PM2_NAME" 2>/dev/null || true

# Clear the app directory
echo "Clearing app directory..."
sudo rm -rf "${APP_DIR:?}"/*
sudo rm -f "${APP_DIR}/.installed-version"

# Redeploy
echo "Running updater..."
sudo /home/admin/scripts/manager-updater.sh

echo ""
echo "Redeploy complete!"
echo "Check logs with: pm2 logs ${PM2_NAME}"
