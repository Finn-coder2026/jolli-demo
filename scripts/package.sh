#!/bin/bash
set -e

NAME="jolli-web"
VERSION=$(jq -r '.version' backend/package.json)
REVISION=$(git rev-parse --short=7 HEAD)
PACKAGE="${NAME}-${VERSION}-${REVISION}.tgz"

rm -rf dist
mkdir -p dist
mkdir -p dist/tools/code2docusaurus/dist
mkdir -p dist/tools/docs2docusaurus/dist
mkdir -p dist/tools/docusaurus2vercel/dist
mkdir -p dist/tools/nextra-generator/dist

cp .npmrc .nvmrc dist/
cp backend/dist/Main.js dist/
cp -r backend/dist/assets dist/
cp frontend/dist/index.html dist/
cp -r frontend/dist/assets dist/
cp tools/code2docusaurus/dist/index.js dist/tools/code2docusaurus/dist/
cp tools/docs2docusaurus/dist/index.js dist/tools/docs2docusaurus/dist/
cp tools/docusaurus2vercel/dist/index.js dist/tools/docusaurus2vercel/dist/
cp tools/nextra-generator/dist/index.js dist/tools/nextra-generator/dist/

jq -n \
	--slurpfile backend backend/package.json \
	--slurpfile common common/package.json \
	--slurpfile jolliagent tools/jolliagent/package.json \
	--slurpfile code2docusaurus tools/code2docusaurus/package.json \
	--slurpfile docs2docusaurus tools/docs2docusaurus/package.json \
	--slurpfile docusaurus2vercel tools/docusaurus2vercel/package.json \
	--slurpfile nextra_generator tools/nextra-generator/package.json \
	--arg NAME "$NAME" \
	--arg PACKAGE "$PACKAGE" \
	'{
		name: $NAME,
		version: $backend[0].version,
		private: true,
		type: "module",
		main: "Main.js",
		package: $PACKAGE,
		workspaces: ["."],
		scripts: {
			start: "node Main.js"
		},
		dependencies: (
			($backend[0].dependencies // {}) +
			($common[0].dependencies // {}) +
            ($jolliagent[0].dependencies // {}) +
            ($code2docusaurus[0].dependencies // {}) +
            ($docs2docusaurus[0].dependencies // {}) +
            ($docusaurus2vercel[0].dependencies // {}) +
            ($nextra_generator[0].dependencies // {}) |
			del(.["jolli-common"]) |
			del(.["jolli-agent"]) |
			del(.["nextra-generator"]) |
			to_entries |
			map(select(.key | startswith("@types/") | not)) |
			sort_by(.key) |
			from_entries
		)
	}' > dist/package.json

COPYFILE_DISABLE=1 tar czf "$PACKAGE" -C dist .

# Package manager app
MANAGER_NAME="jolli-manager"
MANAGER_VERSION=$(jq -r '.version' manager/package.json)
MANAGER_PACKAGE="${MANAGER_NAME}-${MANAGER_VERSION}-${REVISION}.tgz"

rm -rf manager-dist
mkdir -p manager-dist

# Copy Next.js standalone output
cp -r manager/.next/standalone/* manager-dist/

# Copy static files
cp -r manager/public manager-dist/manager/public 2>/dev/null || true
cp -r manager/.next/static manager-dist/manager/.next/static

# Copy pino-roll and its dependencies (not detected by Next.js due to dynamic loading)
# These are required by jolli-common's file logging transport
for pkg in pino-roll file-stream-rotator date-fns pino-abstract-transport split2; do
	if [ -d "node_modules/$pkg" ]; then
		cp -r "node_modules/$pkg" manager-dist/node_modules/
	fi
done

# Create package.json for manager
jq -n \
	--arg NAME "$MANAGER_NAME" \
	--arg VERSION "$MANAGER_VERSION" \
	--arg PACKAGE "$MANAGER_PACKAGE" \
	'{
		name: $NAME,
		version: $VERSION,
		package: $PACKAGE
	}' > manager-dist/package.json

COPYFILE_DISABLE=1 tar czf "$MANAGER_PACKAGE" -C manager-dist .
