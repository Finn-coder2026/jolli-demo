#!/usr/bin/env bash
set -euo pipefail

# Simple local runner to clone a GitHub URL (optionally with subdir),
# run code2docusaurus to generate docs, and build the Docusaurus site.
# Optionally deploy via Vercel if VERCEL_TOKEN is set.

usage() {
  cat << 'USAGE'
Usage:
  scripts/run_local_docs.sh <github_url|local_directory>

Examples:
  # GitHub URL:
  scripts/run_local_docs.sh https://github.com/expressjs/express/tree/HEAD/examples/route-separation

  # Local directory:
  scripts/run_local_docs.sh /path/to/local/project
  scripts/run_local_docs.sh ./relative/path/to/project

Notes:
  - Requires: node >= 18, npm (git only for GitHub URLs)
  - Uses local tools in tools/code2docusaurus and tools/docusaurus2vercel
  - If VERCEL_TOKEN is set, will attempt deployment after local build
  - For local directories, no cloning is performed; the directory is used directly
USAGE
}

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

INPUT_ARG="$1"

require_bin() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: missing required command: $1" >&2
    exit 1
  fi
}

# Always require node and npm
require_bin node
require_bin npm

# Determine if input is a GitHub URL or local directory
IS_LOCAL_DIR=false
if [[ "$INPUT_ARG" =~ ^https://github\.com/ ]]; then
  # GitHub URL - require git
  require_bin git
  GITHUB_URL="$INPUT_ARG"
elif [[ -d "$INPUT_ARG" ]]; then
  # Local directory exists
  IS_LOCAL_DIR=true
  LOCAL_DIR="$(cd "$INPUT_ARG" && pwd)"
else
  echo "Error: Input must be either a GitHub URL or an existing local directory" >&2
  echo "       Input provided: $INPUT_ARG" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TOOLS_CODE2="$ROOT_DIR/tools/code2docusaurus"
TOOLS_D2V="$ROOT_DIR/tools/docusaurus2vercel"

timestamp() { date +%Y%m%d-%H%M%S; }

parse_github_url() {
  # Input like:
  #  https://github.com/<owner>/<repo>
  #  https://github.com/<owner>/<repo>/tree/<ref>
  #  https://github.com/<owner>/<repo>/tree/<ref>/<subpath>
  local url="$1"
  url="${url%%/}" # trim trailing slash
  local rest="${url#https://github.com/}"
  IFS='/' read -r owner repo first second rest_after <<<"$rest"
  if [[ "$first" == "tree" ]]; then
    ref="$second"
    subpath="$rest_after"
  else
    ref=""
    subpath=""
  fi
  echo "$owner" "$repo" "$ref" "$subpath"
}

# Handle GitHub URL vs local directory
if [[ "$IS_LOCAL_DIR" == "true" ]]; then
  # Local directory mode
  REPO_NAME="$(basename "$LOCAL_DIR")"
  WORK_BASE="$ROOT_DIR/tmp/local-docs-${REPO_NAME}-$(timestamp)"
  OUT_DIR="$WORK_BASE/api-docs"
  LOG_DIR="$WORK_BASE/logs"
  mkdir -p "$WORK_BASE" "$LOG_DIR"

  SRC_DIR="$LOCAL_DIR"
  echo "==> Using local directory: $SRC_DIR"
else
  # GitHub URL mode
  OWNER=""; REPO=""; REF=""; SUBPATH=""
  read -r OWNER REPO REF SUBPATH < <(parse_github_url "$GITHUB_URL")

  if [[ -z "$OWNER" || -z "$REPO" ]]; then
    echo "Error: unable to parse owner/repo from URL: $GITHUB_URL" >&2
    exit 1
  fi

  WORK_BASE="$ROOT_DIR/tmp/local-docs-${REPO}-$(timestamp)"
  REPO_DIR="$WORK_BASE/repo"
  OUT_DIR="$WORK_BASE/api-docs"
  LOG_DIR="$WORK_BASE/logs"
  mkdir -p "$WORK_BASE" "$LOG_DIR"

  echo "==> Cloning $OWNER/$REPO into $REPO_DIR"
  git clone --depth 1 "https://github.com/${OWNER}/${REPO}.git" "$REPO_DIR" 2>&1 | tee "$LOG_DIR/clone.log"

  if [[ -n "$REF" && "$REF" != "HEAD" ]]; then
    echo "==> Checking out ref: $REF"
    (cd "$REPO_DIR" && git fetch --depth 1 origin "$REF" && git checkout -q "$REF") 2>&1 | tee "$LOG_DIR/checkout.log"
  fi

  SRC_DIR="$REPO_DIR"
  if [[ -n "$SUBPATH" ]]; then
    SRC_DIR="$REPO_DIR/$SUBPATH"
  fi

  if [[ ! -d "$SRC_DIR" ]]; then
    echo "Error: subpath does not exist: $SRC_DIR" >&2
    exit 1
  fi
fi

echo "==> Building local tools (code2docusaurus, docusaurus2vercel)"
(
  set -e
  # Build from the root directory to maintain workspace context
  cd "$ROOT_DIR"

  # Install dependencies for the entire workspace if needed
  if [[ ! -d "node_modules" ]]; then
    echo "Installing workspace dependencies..."
    npm install 2>&1 | tee "$LOG_DIR/workspace_npm_install.log"
  fi

  # Build the specific tools using workspace commands
  echo "Building code2docusaurus..."
  npm run build -w tools/code2docusaurus 2>&1 | tee "$LOG_DIR/code2_build.log"

  echo "Building docusaurus2vercel..."
  npm run build -w tools/docusaurus2vercel 2>&1 | tee "$LOG_DIR/d2v_build.log"
) || { echo "Build of local tools failed" >&2; exit 1; }

CODE2_BIN="$TOOLS_CODE2/dist/index.js"
D2V_BIN="$TOOLS_D2V/dist/index.js"

echo "==> Running code2docusaurus on: $SRC_DIR"
node "$CODE2_BIN" "$SRC_DIR" --generate-docs -o "$OUT_DIR" 2>&1 | tee "$LOG_DIR/code2_run.log" || {
  echo "code2docusaurus failed. See $LOG_DIR/code2_run.log" >&2
  exit 1
}

echo "==> Local Docusaurus build in: $OUT_DIR"
(
  set -e
  cd "$OUT_DIR"
  npm install 2>&1 | tee "$LOG_DIR/docusaurus_npm_install.log"
  npm run build 2>&1 | tee "$LOG_DIR/docusaurus_build.log"
) || { echo "Local Docusaurus build failed. See $LOG_DIR/docusaurus_build.log" >&2; exit 1; }

if [[ -n "${VERCEL_TOKEN:-}" ]]; then
  echo "==> Deploying via docusaurus2vercel"
  # Use REPO for GitHub URLs, REPO_NAME for local directories
  PROJECT_NAME="${REPO:-$REPO_NAME}"
  node "$D2V_BIN" "$OUT_DIR" -t "$VERCEL_TOKEN" -p "${PROJECT_NAME}-docs" 2>&1 | tee "$LOG_DIR/d2v_deploy.log" || {
    echo "Deployment failed. See $LOG_DIR/d2v_deploy.log" >&2
  }
else
  echo "==> Skipping deployment (VERCEL_TOKEN not set)."
fi

echo "\nDone. Artifacts:"
echo "  Working dir:    $WORK_BASE"
echo "  Source scanned: $SRC_DIR"
echo "  Output docs:    $OUT_DIR"
echo "  Logs:           $LOG_DIR"
echo "  OpenAPI:        $(ls -1 "$OUT_DIR"/openapi.* 2>/dev/null || echo '(not found)')"

exit 0

