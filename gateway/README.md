---
jrn: MKKIR4UTVHFYBLS5
---
# HTTPS Gateway for Local Development

This directory contains an nginx configuration for routing HTTPS requests to the various local development servers based on subdomain.

## Architecture

```
HTTPS Request (port 443)
         |
    +---------+
    |  nginx  |  (SSL termination + routing)
    +----+----+
         |
    +----+----+---------------+
    |         |               |
 admin.*   <tenant>.*      /api/*
    |         |               |
 manager   frontend       backend
 :3034      :8034          :7034
```

## Prerequisites

Install nginx on macOS:
```bash
brew install nginx
```

## Setup

1. **Place SSL certificates in `certs/` directory:**
   ```bash
   cp /path/to/your/domain.cert.pem gateway/certs/
   cp /path/to/your/private.key.pem gateway/certs/
   ```

2. **Configure environment variables:**

   Create `.env.local` files with your gateway domain:

   ```bash
   # backend/.env.local
   GATEWAY_DOMAIN=mydomain.dev

   # frontend/.env.local
   VITE_GATEWAY_DOMAIN=mydomain.dev

   # manager/.env.local
   ADMIN_DOMAIN=admin.mydomain.dev
   ```

   This enables:
   - Dynamic CORS for `https://*.mydomain.dev`
   - HTTPS OAuth redirect URIs
   - Vite allowedHosts for your domain

3. **Start the development servers:**
   ```bash
   # In separate terminals:
   cd backend && npm run dev    # Port 7034
   cd frontend && npm run dev   # Port 8034
   cd manager && npm run dev    # Port 3034
   ```

4. **Start nginx gateway:**
   ```bash
   # From project root
   sudo nginx -c $(pwd)/gateway/nginx.conf
   ```

## Usage

Access your apps via HTTPS:
- `https://admin.<yourdomain>` - Manager app
- `https://<tenant>.<yourdomain>` - Frontend app (with backend API at /api/*)

## Commands

From the project root, use npm scripts:

```bash
# Start nginx gateway
npm run gateway:start

# Stop nginx gateway
npm run gateway:stop

# Reload config after changes
npm run gateway:reload

# Test configuration
npm run gateway:test
```

Or run nginx directly:

```bash
# Start nginx
sudo nginx -c $(pwd)/gateway/nginx.conf

# Stop nginx
sudo nginx -s stop

# Reload config after changes
sudo nginx -s reload

# Test configuration
sudo nginx -t -c $(pwd)/gateway/nginx.conf
```

## Troubleshooting

### "Address already in use" error
Another process is using port 443. Check with:
```bash
sudo lsof -i :443
```

### Certificate errors
Ensure your certificate files are in PEM format and properly named:
- `certs/domain.cert.pem` - SSL certificate
- `certs/private.key.pem` - Private key

### "Permission denied" for certs
nginx needs read access to the certificate files:
```bash
chmod 644 gateway/certs/domain.cert.pem
chmod 600 gateway/certs/private.key.pem
```

### WebSocket/HMR not working
The nginx config includes WebSocket support. If HMR isn't working, check that:
1. The Upgrade and Connection headers are being passed through
2. Your browser allows WebSocket connections to your domain
