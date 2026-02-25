# Jolli Deployment

## Architecture Overview

Jolli runs three application components across two infrastructure patterns:

| Component | Infrastructure | Deploy Method |
|-----------|----------------|---------------|
| **App** (backend + frontend) | ECS EC2        | Docker image pushed to ECR, ECS service force-updated |
| **Worker** (background jobs) | ECS Fargate    | Docker image pushed to ECR, ECS service force-updated |
| **Manager** (superadmin dashboard) | EC2 + PM2      | S3 package downloaded by auto-updater script |

### Environments

| Environment | Domain | Manager Port | Deployed By |
|-------------|--------|-------------|-------------|
| **dev** | `*.dev.jolli.app` | 3034 | Auto-deployed on every push to `main` |
| **preview** | `*.preview.jolli.app` | 3035 | Manual push to `deploy/preview` |
| **prod** | `*.jolli.app` | 3036 | Manual push to `deploy/prod` |

## GitHub Actions Workflows

Four workflows chain together to form the deployment pipeline:

### 1. `jolli.yaml` — CI Pipeline (Build, Lint, Test, Package, Publish)

The main pipeline. Runs on PRs, pushes to `main`, pushes to `deploy/*`, and manual dispatch.

**What runs depends on the trigger:**

| Step | PR to main | Push to main | Push to deploy/dev | Push to deploy/preview or prod | Manual |
|------|:----------:|:------------:|:------------------:|:------------------------------:|:------:|
| Build | yes | yes | yes | yes | yes |
| Lint | yes | yes | — | yes | yes |
| Test | yes | yes | — | yes | yes |
| Package | — | yes | yes | yes | yes |
| Publish | — | yes | yes | yes | yes |
| Rebase deploy/dev | — | yes | — | — | — |
| SSM alias (manager) | — | yes | — | — | — |
| Trigger migrate-schemas | — | yes (dev) | yes | yes | — |

Lint and test are skipped on `deploy/dev` pushes because `deploy/dev` is always rebased from `main` by the CI bot (see [Branch Protection](#branch-protection) below), so the code was already validated. Lint and test still run on `deploy/preview` and `deploy/prod` as an extra safety check since those are manually pushed. Package and publish are skipped on PRs since artifacts aren't needed for validation.

### 2. `migrate-schemas.yaml` — Schema Migrations

Triggered by `jolli.yaml` or manually. Checks out the target commit, runs a dry-run migration against all tenant schemas, and applies changes if needed. On success, triggers `deploy-app-ecs.yaml`.

### 3. `deploy-app-ecs.yaml` — App Deployment (ECS)

Checks out the commit, runs `cdk diff` to detect infrastructure changes (deploys CDK stack only if needed), builds a Docker image, pushes to ECR, and force-updates the ECS service. Waits for the service to stabilize. On success, `migrate-schemas.yaml` triggers `deploy-worker.yaml`.

### 4. `deploy-worker.yaml` — Worker Deployment (ECS)

Same pattern as the app deployment, but for the worker service. Also manages MemoryDB infrastructure via a separate CDK stack.

### Workflow Chain

```
jolli.yaml (build/package/publish)
  └─► migrate-schemas.yaml (schema dry-run + apply)
        └─► deploy-app-ecs.yaml (CDK diff/deploy + Docker build + ECS update)
              └─► deploy-worker.yaml (CDK diff/deploy + Docker build + ECS update)
```

## S3/SSM Artifact Flow

The `package.sh` and `publish.sh` scripts handle artifact creation and distribution:

### Packaging (`scripts/package.sh`)

Creates two tarballs:
- **`jolli-web-{version}-{sha}.tgz`** — backend bundle, frontend assets, and tool scripts
- **`jolli-manager-{version}-{sha}.tgz`** — Next.js standalone output for the manager app

### Publishing (`scripts/publish.sh`)

For each package:
1. Uploads the tarball to S3 (`s3://jolli-builds/{name}/{version}/{package}`) — skips if already present
2. Sets an SSM parameter (`/build/{name}/{branch}`) pointing to the S3 path

The SSM parameter is keyed by **branch name** (e.g., `/build/jolli-manager/main`, `/build/jolli-manager/deploy/dev`). This is how downstream consumers know where to find the latest build for a given branch.

### SSM Aliasing for Dev

When the old pipeline ran the full build on `deploy/dev`, `publish.sh` naturally set `/build/jolli-manager/deploy/dev` because it read the branch name. The new pipeline eliminates that redundant build by rebasing `deploy/dev` to `main` and triggering the deployment directly.

Since the `deploy/dev` build is no longer run, the SSM parameter `/build/jolli-manager/deploy/dev` would go stale. To fix this, `jolli.yaml` copies the SSM value from `/build/jolli-manager/main` to `/build/jolli-manager/deploy/dev` after publishing on `main`. This works because `deploy/dev` is always rebased to `main`, so the same S3 package is valid for both.

> **Note:** The `jolli-web` S3 artifacts are no longer consumed at runtime (single-tenant S3 deployment was retired in favor of ECS). They are still published for historical consistency but are not used by the deployment pipeline. Only `jolli-manager` needs the SSM aliasing.

## Manager Auto-Updater

The manager app runs on an EC2 instance (`10.0.11.12`) using PM2. A systemd timer (`manager-updater.timer`) runs `scripts/manager-updater.sh` every 5 minutes.

**How it works:**
1. For each environment (`dev`, `preview`, `prod`), reads the SSM parameter `/build/jolli-manager/{branch}`
2. Compares the S3 path to the locally installed version (stored in `.installed-version`)
3. If different, downloads the new tarball from S3, extracts it, writes a `.env` file from Parameter Store secrets, and restarts the PM2 process

**Branch-to-environment mapping:**

| Environment | SSM Branch Key |
|-------------|---------------|
| dev | `deploy/dev` |
| preview | `deploy/preview` |
| prod | `deploy/prod` |

## Branch Protection

The `deploy/dev` branch is managed exclusively by CI. The first step in `jolli.yaml` rejects any push to `deploy/dev` where `github.actor` is not `github-actions[bot]`. If a developer accidentally pushes to `deploy/dev` manually, the build fails immediately with an error message directing them to push to `main` instead.

This guarantee is why lint and test can safely be skipped on `deploy/dev` pushes — the code is always an exact rebase of `main`, where it was already validated.

## Deployment Branch Strategy

### Automatic: `main` to dev

Every push to `main` triggers:
1. Full CI pipeline (build, lint, test, package, publish)
2. Rebase `deploy/dev` to `main` and force-push
3. Copy manager SSM param from `main` to `deploy/dev`
4. Trigger migration and ECS deployments for dev

### Manual: Preview and Production

To deploy to preview or production:

1. Pull the latest from the source branch:
	```bash
	git pull origin deploy/dev # or deploy/preview
	```
2. Checkout the target branch:
   ```bash
   git checkout deploy/preview  # or deploy/prod
   ```
2. Rebase from `deploy/dev` (or from `deploy/preview` for prod):
   ```bash
   git rebase origin/deploy/dev
   ```
3. Push (force is needed since we rebase):
   ```bash
   git push --force-with-lease
   ```
4. The push triggers `jolli.yaml`, which builds, packages, publishes, and triggers the deployment chain.

## Directory Structure

| Directory | Description |
|-----------|-------------|
| [`app-cdk/`](./app-cdk/) | AWS CDK stack for app ECS deployment (Fargate, ALB, Parameter Store, CloudWatch) |
| [`worker-cdk/`](./worker-cdk/) | AWS CDK stacks for worker ECS deployment and MemoryDB |
| [`manager/`](./manager/) | Manager-specific deployment configuration |
| [`scripts/`](../scripts/) | Build and deployment scripts (`package.sh`, `publish.sh`, `manager-updater.sh`) |

## Manual Deployment

### Trigger a Full Deployment Manually

Use `workflow_dispatch` on `jolli.yaml` from the GitHub Actions UI. This runs the full pipeline (build, lint, test, package, publish) but does not automatically trigger downstream deployment workflows.

### Trigger Individual Workflows

Each downstream workflow can be triggered independently from the GitHub Actions UI:

- **Schema migrations:** Run `migrate-schemas.yaml` with the target environment and commit SHA
- **App deployment:** Run `deploy-app-ecs.yaml` with the target environment and commit SHA
- **Worker deployment:** Run `deploy-worker.yaml` with the target environment and commit SHA

### Force Manager Update

To force an immediate manager update without waiting for the 5-minute poll:
```bash
# SSH into the EC2 instance
ssh admin@10.0.11.12

# Run the updater manually
sudo /home/admin/scripts/manager-updater.sh

# Check PM2 status
pm2 status
```
