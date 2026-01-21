# Manager App Deployment Guide

This document describes how to deploy the Jolli Manager app to AWS EC2 with VPN-only access.

## Overview

The Manager app is a Next.js application that manages Jolli tenants, organizations, and database providers. It runs on an EC2 instance in a private subnet, accessible only via WireGuard VPN.

**Environments:**
| Environment | Domain | Port | Branch | Parameter Store |
|-------------|--------|------|--------|-----------------|
| DEV | `admin.jolli.dev` | 3034 | `deploy/dev` | `/manager/dev/*` |
| PREVIEW | `admin.jolli.cloud` | 3035 | `deploy/preview` | `/manager/preview/*` |
| PROD | `admin.jolli.ai` | 3036 | `deploy/prod` | `/manager/prod/*` |

## Architecture

```
GitHub Actions (on push to deploy/*)
    │
    ├─→ scripts/package.sh → Creates jolli-manager-*.tgz
    │
    └─→ scripts/publish.sh → Uploads to S3 + updates Parameter Store
                                    │
                                    ▼
                        /build/jolli-manager/{branch}
                                    │
EC2 (every 5 min via systemd timer) │
    │                               │
    └─→ manager-updater.sh ─────────┘
            │
            ├─→ Downloads from S3
            ├─→ Extracts to ~/apps/manager-{env}/
            ├─→ Creates .env with PSTORE_ENV
            └─→ Restarts PM2 process
```

## Infrastructure Components

### 1. Neon Database (jolli project)

- **Region:** us-west-2
- **Databases:**
  - `jolli_registry_dev`
  - `jolli_registry_preview`
  - `jolli_registry`

### 2. EC2 Instance

- **Private IP:** 10.0.11.12
- **Instance Type:** t4g.small (ARM64)
- **Subnet:** Private subnet (10.0.11.0/24)
- **Security Group:** `jolli-manager-sg`
  - Inbound: HTTP/HTTPS/SSH from VPN CIDR (10.13.13.0/24) only
  - Outbound: HTTPS to internet (for Neon, S3, npm)
- **IAM Role:** `jolli-node-role`

### 3. Route53 Private Hosted Zones

Three private hosted zones associated with the VPC:
- `jolli.dev` → A record: `admin` → 10.0.11.12
- `jolli.cloud` → A record: `admin` → 10.0.11.12
- `jolli.ai` → A record: `admin` → 10.0.11.12

Each zone also has a wildcard CNAME (`*` → `cname.vercel-dns.com`) to forward non-admin subdomains to Vercel.

### 4. WireGuard VPN

Clients must have `DNS = 10.0.0.2` in their config to resolve the private hosted zones.

---

## Initial Server Setup

If setting up a new EC2 instance:

### 1. Launch EC2 Instance

- AMI: Debian 12 or Ubuntu 22.04 (ARM64)
- Instance type: t4g.small
- Subnet: Private subnet (10.0.11.0/24)
- Security group: `jolli-manager-sg`
- IAM role: `jolli-node-role`
- No public IP

### 2. Install Dependencies

SSH via VPN:
```bash
ssh -i /path/to/key.pem admin@10.0.11.12
```

Install Node.js, PM2, and nginx:
```bash
# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install Node.js 24
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2
sudo npm install -g pm2

# Install nginx
sudo apt-get install -y nginx
sudo systemctl enable nginx
```

### 3. Configure nginx

Create `/etc/nginx/sites-available/jolli-manager`:
```nginx
# DEV
server {
    listen 80;
    server_name admin.jolli.dev;

    location / {
        proxy_pass http://127.0.0.1:3034;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# PREVIEW
server {
    listen 80;
    server_name admin.jolli.cloud;

    location / {
        proxy_pass http://127.0.0.1:3035;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# PROD
server {
    listen 80;
    server_name admin.jolli.ai;

    location / {
        proxy_pass http://127.0.0.1:3036;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/jolli-manager /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

### 4. Create App Directories

```bash
mkdir -p ~/apps/{manager-dev,manager-preview,manager-prod}
mkdir -p ~/scripts
```

### 5. Install Auto-Updater Script

Copy `scripts/manager-updater.sh` to the server:
```bash
scp -i /path/to/key.pem scripts/manager-updater.sh admin@10.0.11.12:~/scripts/
ssh -i /path/to/key.pem admin@10.0.11.12 "chmod +x ~/scripts/manager-updater.sh"
```

### 6. Create Systemd Timer

Create the service file:
```bash
sudo nano /etc/systemd/system/manager-updater.service
```

Paste the following content:
```ini
[Unit]
Description=Jolli Manager Auto-Updater
After=network.target

[Service]
Type=oneshot
User=admin
ExecStart=/home/admin/scripts/manager-updater.sh
StandardOutput=journal
StandardError=journal
```

Save and exit (Ctrl+O, Enter, Ctrl+X).

Create the timer file:
```bash
sudo nano /etc/systemd/system/manager-updater.timer
```

Paste the following content:
```ini
[Unit]
Description=Run Jolli Manager Updater every 5 minutes

[Timer]
OnBootSec=1min
OnUnitActiveSec=5min
AccuracySec=1min

[Install]
WantedBy=timers.target
```

Save and exit (Ctrl+O, Enter, Ctrl+X).

Enable and start the timer:
```bash
sudo systemctl daemon-reload
sudo systemctl enable manager-updater.timer
sudo systemctl start manager-updater.timer

# Verify it's running
systemctl status manager-updater.timer
systemctl list-timers | grep manager
```

### 7. Configure PM2 Startup

```bash
pm2 startup
# Follow the instructions to run the sudo command
pm2 save
```

---

## AWS Parameter Store Configuration

### Build Version Parameters

Set automatically by `scripts/publish.sh`:
- `/build/jolli-manager/deploy/dev` → S3 path to dev build
- `/build/jolli-manager/deploy/preview` → S3 path to preview build
- `/build/jolli-manager/deploy/prod` → S3 path to prod build

### Environment Secret Parameters

Set manually (SecureString type):

| Parameter | Description |
|-----------|-------------|
| `registry/database/url` | Connection string to the jolli_registry database |
| `admin/postgres/url` | Admin connection string for superuser operations |
| `encryption/key` | Encryption key for database passwords (32-byte hex) |
| `backend/internal/url` | Backend API URL for bootstrap calls (e.g., `https://api.jolli.dev`) |
| `bootstrap/secret` | Shared secret for HMAC auth (must match backend's `BOOTSTRAP_SECRET`) |
| `vercel/bypass/secret` | Vercel protection bypass secret for programmatic API access |

**DEV:**
```bash
aws ssm put-parameter --name "/manager/dev/registry/database/url" \
    --value "postgresql://..." --type SecureString --region us-west-2
aws ssm put-parameter --name "/manager/dev/admin/postgres/url" \
    --value "postgresql://..." --type SecureString --region us-west-2
aws ssm put-parameter --name "/manager/dev/encryption/key" \
    --value "$(openssl rand -hex 32)" --type SecureString --region us-west-2
aws ssm put-parameter --name "/manager/dev/backend/internal/url" \
    --value "https://api.jolli.dev" --type SecureString --region us-west-2
aws ssm put-parameter --name "/manager/dev/bootstrap/secret" \
    --value "SAME_AS_BACKEND_BOOTSTRAP_SECRET" --type SecureString --region us-west-2
aws ssm put-parameter --name "/manager/dev/vercel/bypass/secret" \
    --value "BYPASS_SECRET_FROM_VERCEL_DASHBOARD" --type SecureString --region us-west-2
```

**PREVIEW:**
```bash
aws ssm put-parameter --name "/manager/preview/registry/database/url" \
    --value "postgresql://..." --type SecureString --region us-west-2
aws ssm put-parameter --name "/manager/preview/admin/postgres/url" \
    --value "postgresql://..." --type SecureString --region us-west-2
aws ssm put-parameter --name "/manager/preview/encryption/key" \
    --value "$(openssl rand -hex 32)" --type SecureString --region us-west-2
aws ssm put-parameter --name "/manager/preview/backend/internal/url" \
    --value "https://api.jolli.cloud" --type SecureString --region us-west-2
aws ssm put-parameter --name "/manager/preview/bootstrap/secret" \
    --value "SAME_AS_BACKEND_BOOTSTRAP_SECRET" --type SecureString --region us-west-2
aws ssm put-parameter --name "/manager/preview/vercel/bypass/secret" \
    --value "BYPASS_SECRET_FROM_VERCEL_DASHBOARD" --type SecureString --region us-west-2
```

**PROD:**
```bash
aws ssm put-parameter --name "/manager/prod/registry/database/url" \
    --value "postgresql://..." --type SecureString --region us-west-2
aws ssm put-parameter --name "/manager/prod/admin/postgres/url" \
    --value "postgresql://..." --type SecureString --region us-west-2
aws ssm put-parameter --name "/manager/prod/encryption/key" \
    --value "$(openssl rand -hex 32)" --type SecureString --region us-west-2
aws ssm put-parameter --name "/manager/prod/backend/internal/url" \
    --value "https://api.jolli.ai" --type SecureString --region us-west-2
aws ssm put-parameter --name "/manager/prod/bootstrap/secret" \
    --value "SAME_AS_BACKEND_BOOTSTRAP_SECRET" --type SecureString --region us-west-2
aws ssm put-parameter --name "/manager/prod/vercel/bypass/secret" \
    --value "BYPASS_SECRET_FROM_VERCEL_DASHBOARD" --type SecureString --region us-west-2
```

**Notes:**
- The `bootstrap/secret` must match the backend's `BOOTSTRAP_SECRET` parameter (stored at `/jolli/backend/{env}/bootstrap/secret`).
- The `vercel/bypass/secret` is found in Vercel Dashboard → Project Settings → Deployment Protection → "Protection Bypass for Automation".

---

## IAM Permissions

The `jolli-node-role` needs:

**S3 Access** (via `jolli-builds-s3` policy):
```json
{
    "Effect": "Allow",
    "Action": ["s3:GetObject", "s3:PutObject", "s3:ListBucket"],
    "Resource": [
        "arn:aws:s3:::jolli-builds",
        "arn:aws:s3:::jolli-builds/*"
    ]
}
```

**SSM Access** (via `jolli-builds-ssm` policy):
```json
{
    "Effect": "Allow",
    "Action": ["ssm:GetParameter", "ssm:PutParameter"],
    "Resource": [
        "arn:aws:ssm:us-west-2:307926602659:parameter/build/*",
        "arn:aws:ssm:us-west-2:307926602659:parameter/manager/*"
    ]
}
```

---

## Deployment Workflow

1. **Push to deploy branch:**
   ```bash
   git push origin deploy/dev    # Deploys to admin.jolli.dev
   git push origin deploy/preview # Deploys to admin.jolli.cloud
   git push origin deploy/prod   # Deploys to admin.jolli.ai
   ```

2. **GitHub Actions runs:**
   - `npm run build` (builds manager app)
   - `scripts/package.sh` (creates jolli-manager-*.tgz)
   - `scripts/publish.sh` (uploads to S3, updates Parameter Store)

3. **EC2 auto-updater (every 5 min):**
   - Checks Parameter Store for new version
   - Downloads from S3 if changed
   - Extracts and restarts PM2 process

---

## Troubleshooting

### Check updater logs
```bash
sudo tail -f /var/log/manager-updater.log
```

### Check PM2 status
```bash
pm2 list
pm2 logs manager-dev
```

### Check systemd timer
```bash
systemctl status manager-updater.timer
systemctl list-timers | grep manager
```

### Manual update trigger
```bash
~/scripts/manager-updater.sh
```

### Check nginx status
```bash
sudo systemctl status nginx
sudo nginx -t
```

### Corrupted Deployment (Chunk Load Errors)

**Symptoms:**
- Browser shows "ChunkLoadError: Loading chunk X failed"
- Console shows 400 errors for `/_next/static/chunks/*.js` files
- Hard refresh and clearing browser cache don't help

**Diagnosis:**

Check if the server is serving HTML with mismatched chunk hashes:
```bash
# Check what hash the server is returning
curl -s http://localhost:3035/providers | grep -o 'page-[a-f0-9]*\.js' | head -3

# Check what files actually exist
ls /home/admin/apps/manager-preview/manager/.next/static/chunks/app/providers/
```

If the hashes don't match, the deployment is corrupted.

**Fix:**

Use the redeploy script to force a clean deployment:
```bash
~/scripts/manager-redeploy.sh preview  # or dev, prod
```

This will:
1. Stop the PM2 process
2. Clear the app directory completely
3. Re-download and extract the package from S3
4. Restart the PM2 process

**Install the redeploy script (if not present):**
```bash
scp scripts/manager-redeploy.sh admin@10.0.11.12:~/scripts/
ssh admin@10.0.11.12 "chmod +x ~/scripts/manager-redeploy.sh"
```

---

## Route53 Private Hosted Zone Setup

If recreating the DNS:

1. Create private hosted zone for each domain (`jolli.dev`, `jolli.cloud`, `jolli.ai`)
2. Associate with VPC (`team-access-vpc`)
3. Add A record: `admin` → `10.0.11.12`
4. Add CNAME record: `*` → `cname.vercel-dns.com`

Update WireGuard client configs to use VPC DNS:
```ini
DNS = 10.0.0.2
```
