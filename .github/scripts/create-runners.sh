#!/usr/bin/env bash
set -euo pipefail

COUNT="${1:-1}"
GITHUB_URL="https://github.com/jolliai/jolli"
LABELS="self-hosted"
CPUS=4
MEMORY=4g

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

echo "==> Fetching runner registration token from GitHub"
RUNNER_TOKEN=$(curl -s -X POST \
	-H "Authorization: token $GITHUB_TOKEN" \
	https://api.github.com/repos/jolliai/jolli/actions/runners/registration-token \
	| jq -r .token)

if [ -z "$RUNNER_TOKEN" ] || [ "$RUNNER_TOKEN" = "null" ]; then
	echo "Error: Failed to get runner registration token from GitHub"
	echo "Make sure your GITHUB_TOKEN has the required permissions"
	exit 1
fi

# Build Docker image if it doesn't exist
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_NAME="github-actions-runner"

if ! docker images "$IMAGE_NAME" | grep -q "$IMAGE_NAME"; then
	echo "==> Building Docker image: $IMAGE_NAME"
	docker build -t "$IMAGE_NAME" "$SCRIPT_DIR"
else
	echo "==> Docker image $IMAGE_NAME already exists"
fi

create_runner_container() {
	local i="$1"
	local HOST_PREFIX=$(hostname | cut -d. -f1)
	local NAME="${HOST_PREFIX}-runner-${i}"

	# Skip if container already exists and is running
	if docker ps -a --format '{{.Names}}' | grep -q "^${NAME}$"; then
		if docker ps --format '{{.Names}}' | grep -q "^${NAME}$"; then
			echo "Container $NAME already exists and is running, skipping creation."
		else
			echo "Container $NAME exists but is not running, starting it."
			docker start "$NAME"
		fi
	else
		echo "==> Creating Docker container: $NAME"
		docker run -d \
			--name "$NAME" \
			--cpus="$CPUS" \
			--memory="$MEMORY" \
			--restart unless-stopped \
			"$IMAGE_NAME" \
			sleep infinity
	fi

	# Check if runner is already configured
	if docker exec "$NAME" test -f /home/runner/actions-runner/.runner 2>/dev/null; then
		echo "Runner already configured inside $NAME, skipping registration."
	else
		echo "==> Configuring GitHub runner inside $NAME"
		docker exec "$NAME" bash -c "
			cd /home/runner/actions-runner &&
			./config.sh --unattended --url ${GITHUB_URL} --token ${RUNNER_TOKEN} \
									--name ${NAME} --machinename ${NAME} --labels '${LABELS}' --work _work
		"
	fi

	# Ensure exactly one runner process is running
	echo "==> Ensuring runner process active in $NAME"
	if ! docker exec "$NAME" pgrep -f "Runner.Listener" >/dev/null 2>&1; then
		echo "Starting runner service in $NAME"
		docker exec -d "$NAME" bash -c 'cd /home/runner/actions-runner && ./run.sh'
	fi

	echo "Runner $NAME ready and running."
}

for i in $(seq 1 "$COUNT"); do
	create_runner_container "$i"
done

echo "All $COUNT runners are up!"
