#!/usr/bin/env bash
set -euo pipefail

COUNT="${1:-1}"
GITHUB_URL="https://github.com/jolliai/jolli"

if [ -z "${GITHUB_TOKEN:-}" ]; then
	echo "Error: GITHUB_TOKEN environment variable is not set"
	echo "Please set GITHUB_TOKEN with a GitHub personal access token that has repo/admin:org scope"
	exit 1
fi

# Check required dependencies
for cmd in docker jq curl; do
	if ! command -v "$cmd" &>/dev/null; then
		echo "Error: $cmd is not installed. Please install it first."
		exit 1
	fi
done

delete_runner_container() {
	local i="$1"
	local HOST_PREFIX=$(hostname | cut -d. -f1)
	local NAME="${HOST_PREFIX}-runner-${i}"

	echo "==> Deleting runner $NAME"

	# Check if container exists
	if ! docker ps -a --format '{{.Names}}' | grep -q "^${NAME}$"; then
		echo "Container $NAME does not exist, skipping."
		return
	fi

	# Remove runner from GitHub if configured
	if docker exec "$NAME" test -f /home/runner/actions-runner/.runner 2>/dev/null; then
		echo "Removing runner registration from GitHub"
		REMOVE_TOKEN=$(curl -s -X POST \
			-H "Authorization: token $GITHUB_TOKEN" \
			https://api.github.com/repos/jolliai/jolli/actions/runners/remove-token \
			| jq -r .token)

		if [ -n "$REMOVE_TOKEN" ] && [ "$REMOVE_TOKEN" != "null" ]; then
			docker exec "$NAME" bash -c "
				cd /home/runner/actions-runner &&
				./config.sh remove --token ${REMOVE_TOKEN}
			" 2>/dev/null || true
		fi
	fi

	# Stop and delete the container
	echo "Stopping and deleting container $NAME"
	docker stop "$NAME" 2>/dev/null || true
	docker rm "$NAME" 2>/dev/null || true

	echo "Deleted runner $NAME"
}

for i in $(seq 1 "$COUNT"); do
	delete_runner_container "$i"
done

# Remove the Docker image if no containers are using it
IMAGE_NAME="github-actions-runner"
if docker images "$IMAGE_NAME" | grep -q "$IMAGE_NAME"; then
	echo "==> Removing Docker image: $IMAGE_NAME"
	docker rmi "$IMAGE_NAME" 2>/dev/null || echo "Note: Image may still be in use by other containers"
fi

echo "All $COUNT runners deleted!"
