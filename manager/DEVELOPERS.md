# Manager App Developer Guide

This guide covers the setup and configuration for developing the Jolli Manager application.

## Prerequisites

- Node.js 20+ (use `nvm use` in project root)
- PostgreSQL database
- Redis (optional, for session storage)
- Google Cloud Console account (for OAuth)

## Quick Start

```bash
# Install dependencies (from project root)
npm install

# Copy environment template
cd manager
cp .env.example .env.local

# Start development server (from project root)
cd ..
npm run manager
```

## Environment Configuration

### Database Configuration

```bash
# Tenant Registry Database (stores tenant metadata, providers, domains)
REGISTRY_DATABASE_URL=postgres://postgres:postgres@localhost:5432/jolli_registry

# Admin PostgreSQL Connection (for creating tenant databases)
ADMIN_POSTGRES_URL=postgres://postgres:postgres@localhost:5432/postgres

# Encryption key for storing database credentials (32 bytes)
# Generate with: openssl rand -base64 32
ENCRYPTION_KEY=your-32-byte-hex-key
```

### Authentication Configuration

The Manager app uses Google OAuth for authentication with JWT-based sessions.

#### 1. Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new project or select existing one
3. Navigate to **APIs & Services** > **Credentials**
4. Click **Create Credentials** > **OAuth client ID**
5. Select **Web application**
6. Add **Authorized JavaScript origins**:
   - Development: `http://localhost:3034`
   - Production: `https://your-domain.com`
7. Add **Authorized redirect URIs**:
   - Development: `http://localhost:3034/api/auth/callback`
   - Production: `https://your-domain.com/api/auth/callback`
8. Copy the Client ID and Client Secret

```bash
# Google OAuth credentials
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-client-secret
```

#### 2. JWT Token Configuration

```bash
# Generate a secure secret for JWT signing
# Run: openssl rand -base64 32
TOKEN_SECRET=your-base64-secret-key

# Token expiration time (default: 2h)
# Supported formats: 7d (days), 24h (hours), 30m (minutes), 60s (seconds)
TOKEN_EXPIRES_IN=2h
```

#### 3. Initial SuperAdmin

On first startup, if the specified email doesn't exist, a SuperAdmin user will be created:

```bash
# Email address for the initial SuperAdmin account
INITIAL_SUPER_ADMIN_EMAIL=admin@your-domain.com
```

### Redis Configuration

Redis is used for session storage. Without Redis, sessions are stored in memory (not recommended for production).

#### Option 1: Docker (Recommended for Development)

```bash
# Start Redis container
docker run -d \
  --name jolli-redis \
  -p 6379:6379 \
  redis:7-alpine

# Verify Redis is running
docker ps | grep jolli-redis

# Test connection
redis-cli ping
# Should return: PONG
```

#### Option 2: Docker Compose

Create a `docker-compose.yml` in the manager directory:

```yaml
version: '3.8'
services:
  redis:
    image: redis:7-alpine
    container_name: jolli-redis
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes
    restart: unless-stopped

volumes:
  redis-data:
```

Then run:

```bash
docker-compose up -d
```

#### Option 3: Local Redis Installation

**macOS (Homebrew):**
```bash
brew install redis
brew services start redis
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install redis-server
sudo systemctl start redis-server
```

#### Redis Environment Variable

```bash
# Redis connection URL
# Format: redis://[username:password@]host:port[/database]
SESSION_REDIS_URL=redis://localhost:6379

# With authentication:
# SESSION_REDIS_URL=redis://:your-password@localhost:6379

# With database selection:
# SESSION_REDIS_URL=redis://localhost:6379/1
```

### Verifying Redis Sessions

After logging in, you can verify sessions are stored in Redis:

```bash
# Connect to Redis CLI
redis-cli

# List all manager session keys
KEYS manager:session:*

# View a specific session (replace 1 with actual userId)
GET manager:session:1

# Check session TTL (time to live in seconds)
TTL manager:session:1

# Delete a session (force logout)
DEL manager:session:1
```

**Session data structure:**
```json
{
  "userId": 1,
  "email": "admin@jolli.ai",
  "role": "super_admin",
  "createdAt": 1737280000000,
  "expiresAt": 1737884800000
}
```

## User Roles

| Role | Description | Permissions |
|------|-------------|-------------|
| `super_admin` | Full administrative access | All operations including user management |
| `user` | Read-only access | View tenants, providers; no write operations |

### Permission Matrix

| Feature | SuperAdmin | User (read-only) |
|---------|-----------|------------------|
| View Tenants | Yes | Yes |
| Create/Edit/Delete Tenants | Yes | No |
| Provision Tenants | Yes | No |
| View Providers | Yes | Yes |
| Create/Edit/Delete Providers | Yes | No |
| View Users | Yes | No |
| Create/Edit/Delete Users | Yes | No |

## Development Commands

```bash
# Start development server (port 3034)
npm run dev

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Type checking
npm run typecheck

# Linting
npm run lint

# Build for production
npm run build
```

## Troubleshooting

### Redis Connection Issues

1. **Check if Redis is running:**
   ```bash
   redis-cli ping
   ```

2. **Check Docker container:**
   ```bash
   docker logs jolli-redis
   ```

3. **Verify connection URL:**
   ```bash
   redis-cli -u redis://localhost:6379 ping
   ```

### OAuth Redirect Issues

1. Ensure redirect URI in Google Console matches exactly:
   - `http://localhost:3034/api/auth/callback` (development)

### Session Not Persisting

1. Check if `TOKEN_SECRET` is set
2. Verify Redis is running (if `SESSION_REDIS_URL` is set)
3. Check browser cookies are enabled
4. Ensure you're not in incognito mode with strict cookie settings

### "Unauthorized" Errors

1. Clear browser cookies and re-login
2. Check if session expired (default: 2 hours, configurable via `TOKEN_EXPIRES_IN`)
3. Verify user exists in database and is active

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REGISTRY_DATABASE_URL` | Yes | - | PostgreSQL URL for tenant registry |
| `ADMIN_POSTGRES_URL` | Yes | - | PostgreSQL URL for admin operations |
| `ENCRYPTION_KEY` | No | - | 32-byte hex key for encrypting credentials |
| `GOOGLE_CLIENT_ID` | Yes* | - | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes* | - | Google OAuth client secret |
| `TOKEN_SECRET` | Yes* | - | JWT signing secret |
| `TOKEN_EXPIRES_IN` | No | `7d` | JWT token expiration |
| `SESSION_REDIS_URL` | No | - | Redis URL for session storage |
| `INITIAL_SUPER_ADMIN_EMAIL` | No | - | Email for initial SuperAdmin |
| `ADMIN_EMAIL_PATTERN` | No | `^.*@jolli\.ai$` | Regex for allowed admin emails |
| `NODE_ENV` | No | `development` | Environment mode |

*Required for authentication to work. Without these, all routes will be unprotected.
