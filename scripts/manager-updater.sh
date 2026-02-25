#!/bin/bash
# Manager App Auto-Updater Script
# This script runs on the EC2 instance (10.0.11.12) to automatically
# pull and deploy new versions of the manager app from S3.
#
# Install location on EC2: /home/admin/scripts/manager-updater.sh
# Triggered by: systemd timer (manager-updater.timer) every 5 minutes
#
# See scripts/manager-deployment.md for full deployment documentation.

set -e

AWS_REGION="us-west-2"
APPS_DIR="/home/admin/apps"
LOG_FILE="/var/log/manager-updater.log"

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') $1" | sudo tee -a "$LOG_FILE" > /dev/null
}

update_environment() {
    local ENV=$1
    local BRANCH=$2
    local PORT=$3
    local PM2_NAME="manager-${ENV}"
    local APP_DIR="${APPS_DIR}/${PM2_NAME}"
    local INSTALLED_VERSION_FILE="${APP_DIR}/.installed-version"

    # Get latest build from Parameter Store
    LATEST_S3_PATH=$(aws ssm get-parameter --name "/build/jolli-manager/${BRANCH}" --query 'Parameter.Value' --output text --region "$AWS_REGION" 2>/dev/null || echo "")

    if [ -z "$LATEST_S3_PATH" ]; then
        log "[$ENV] No build found for branch $BRANCH"
        return 0
    fi

    # Get currently installed version
    INSTALLED_S3_PATH=""
    if [ -f "$INSTALLED_VERSION_FILE" ]; then
        INSTALLED_S3_PATH=$(cat "$INSTALLED_VERSION_FILE")
    fi

    # Compare versions
    if [ "$LATEST_S3_PATH" = "$INSTALLED_S3_PATH" ]; then
        log "[$ENV] Already up to date: $LATEST_S3_PATH"
        return 0
    fi

    log "[$ENV] Updating from $INSTALLED_S3_PATH to $LATEST_S3_PATH"

    # Download new package
    TEMP_DIR=$(mktemp -d)
    PACKAGE_FILE="${TEMP_DIR}/package.tgz"
    aws s3 cp "$LATEST_S3_PATH" "$PACKAGE_FILE" --region "$AWS_REGION"

    # Extract to app directory
    mkdir -p "$APP_DIR"
    rm -rf "${APP_DIR:?}"/*
    tar -xzf "$PACKAGE_FILE" -C "$APP_DIR"

    # Cleanup temp dir
    rm -rf "$TEMP_DIR"

    # Fetch secrets from Parameter Store and create .env file in manager subdirectory
    local PSTORE_PREFIX="/manager/${ENV}"
    local REGISTRY_DB_URL=$(aws ssm get-parameter --name "${PSTORE_PREFIX}/registry/database/url" --with-decryption --query 'Parameter.Value' --output text --region "$AWS_REGION" 2>/dev/null || echo "")
    local ADMIN_PG_URL=$(aws ssm get-parameter --name "${PSTORE_PREFIX}/admin/postgres/url" --with-decryption --query 'Parameter.Value' --output text --region "$AWS_REGION" 2>/dev/null || echo "")
    local ENC_KEY=$(aws ssm get-parameter --name "${PSTORE_PREFIX}/encryption/key" --with-decryption --query 'Parameter.Value' --output text --region "$AWS_REGION" 2>/dev/null || echo "")
    local BACKEND_INTERNAL_URL=$(aws ssm get-parameter --name "${PSTORE_PREFIX}/backend/internal/url" --with-decryption --query 'Parameter.Value' --output text --region "$AWS_REGION" 2>/dev/null || echo "")
    local BOOTSTRAP_SECRET=$(aws ssm get-parameter --name "${PSTORE_PREFIX}/bootstrap/secret" --with-decryption --query 'Parameter.Value' --output text --region "$AWS_REGION" 2>/dev/null || echo "")
    local VERCEL_BYPASS_SECRET=$(aws ssm get-parameter --name "${PSTORE_PREFIX}/vercel/bypass/secret" --with-decryption --query 'Parameter.Value' --output text --region "$AWS_REGION" 2>/dev/null || echo "")
    local DISABLE_DEFAULT_PROVIDER=$(aws ssm get-parameter --name "${PSTORE_PREFIX}/disable/default/provider" --with-decryption --query 'Parameter.Value' --output text --region "$AWS_REGION" 2>/dev/null || echo "")
	local GOOGLE_CLIENT_ID=$(aws ssm get-parameter --name "${PSTORE_PREFIX}/google/client/id" --with-decryption --query 'Parameter.Value' --output text --region "$AWS_REGION" 2>/dev/null || echo "")
	local GOOGLE_CLIENT_SECRET=$(aws ssm get-parameter --name "${PSTORE_PREFIX}/google/client/secret" --with-decryption --query 'Parameter.Value' --output text --region "$AWS_REGION" 2>/dev/null || echo "")
	local TOKEN_SECRET=$(aws ssm get-parameter --name "${PSTORE_PREFIX}/token/secret" --with-decryption --query 'Parameter.Value' --output text --region "$AWS_REGION" 2>/dev/null || echo "")
	local INITIAL_SUPER_ADMIN_EMAIL=$(aws ssm get-parameter --name "${PSTORE_PREFIX}/initial/super/admin/email" --with-decryption --query 'Parameter.Value' --output text --region "$AWS_REGION" 2>/dev/null || echo "")
	local ADMIN_DOMAIN=$(aws ssm get-parameter --name "${PSTORE_PREFIX}/admin/domain" --with-decryption --query 'Parameter.Value' --output text --region "$AWS_REGION" 2>/dev/null || echo "")

    cat > "${APP_DIR}/manager/.env" << ENVEOF
PORT=${PORT}
NODE_ENV=production
ADMIN_EMAIL_PATTERN=^.*@jolli\\.ai$
AWS_REGION=${AWS_REGION}
REGISTRY_DATABASE_URL=${REGISTRY_DB_URL}
ADMIN_POSTGRES_URL=${ADMIN_PG_URL}
ENCRYPTION_KEY=${ENC_KEY}
BACKEND_INTERNAL_URL=${BACKEND_INTERNAL_URL}
BOOTSTRAP_SECRET=${BOOTSTRAP_SECRET}
VERCEL_BYPASS_SECRET=${VERCEL_BYPASS_SECRET}
DISABLE_DEFAULT_PROVIDER=${DISABLE_DEFAULT_PROVIDER}
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
TOKEN_SECRET=${TOKEN_SECRET}
INITIAL_SUPER_ADMIN_EMAIL=${INITIAL_SUPER_ADMIN_EMAIL}
ADMIN_DOMAIN=${ADMIN_DOMAIN}
ENVEOF

    # Save installed version
    echo "$LATEST_S3_PATH" > "$INSTALLED_VERSION_FILE"

    # Restart PM2 process with environment variables
    cd "${APP_DIR}/manager"
    if pm2 describe "$PM2_NAME" > /dev/null 2>&1; then
        pm2 delete "$PM2_NAME"
    fi
    # Source .env and start PM2 with environment variables
    set -a
    source .env
    set +a
    pm2 start server.js --name "$PM2_NAME" --cwd "${APP_DIR}/manager"

    log "[$ENV] Updated and restarted successfully"
}

# Update each environment
update_environment "dev" "deploy/dev" 3034
update_environment "preview" "deploy/preview" 3035
update_environment "prod" "deploy/prod" 3036

pm2 save
