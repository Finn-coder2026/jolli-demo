#!/bin/bash
#
# End-to-end test for server-side delete propagation
#
# Flow:
# 1. Build CLI
# 2. Start reference server
# 3. Create a markdown file locally
# 4. Sync up to server
# 5. Call DELETE endpoint to soft-delete on server
# 6. Sync down
# 7. Verify file is gone locally
#

set -e

CLI_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
SYNC_SERVER_URL="http://localhost:3001"
TEST_DIR=""
SERVER_PID=""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${YELLOW}[TEST]${NC} $1"
}

success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    cleanup
    exit 1
}

cleanup() {
    log "Cleaning up..."

    # Kill server if running
    if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
        kill "$SERVER_PID" 2>/dev/null || true
        wait "$SERVER_PID" 2>/dev/null || true
        log "Stopped reference server (PID: $SERVER_PID)"
    fi

    # Remove test directory
    if [ -n "$TEST_DIR" ] && [ -d "$TEST_DIR" ]; then
        rm -rf "$TEST_DIR"
        log "Removed test directory: $TEST_DIR"
    fi
}

trap cleanup EXIT

# Step 1: Build CLI
log "Building CLI..."
cd "$CLI_DIR"
bun run build
success "CLI built"

# Step 2: Start reference server
log "Starting reference server..."
bun src/reference-server/server.ts &
SERVER_PID=$!
sleep 1

# Verify server is running
if ! curl -s "$SYNC_SERVER_URL/v1/sync/status" > /dev/null; then
    fail "Reference server failed to start"
fi
success "Reference server running (PID: $SERVER_PID)"

# Step 3: Create test directory and file
TEST_DIR=$(mktemp -d)
log "Created test directory: $TEST_DIR"

cd "$TEST_DIR"

# Create .jolli directory for sync state
mkdir -p .jolli

# Create a markdown file
cat > "test-article.md" << 'EOF'
# Test Article

This article will be deleted from the server.

Some content here.
EOF

log "Created test-article.md"

# Step 4: Sync up to server
log "Syncing up to server..."
SYNC_SERVER_URL="$SYNC_SERVER_URL" "$CLI_DIR/dist/bin/jolli" sync up

# Verify file was synced by checking state
if [ ! -f ".jolli/sync.md" ]; then
    fail "Sync state file not created"
fi

# Extract fileId from state (YAML format: fileId: "VALUE" or fileId: VALUE)
FILE_ID=$(grep -o 'fileId: "[^"]*"\|fileId: [^[:space:]]*' .jolli/sync.md | head -1 | sed 's/fileId: //' | tr -d '"')
if [ -z "$FILE_ID" ]; then
    fail "Could not extract fileId from sync state"
fi
log "File synced with fileId: $FILE_ID"

# Verify server has the file
SERVER_STATUS=$(curl -s "$SYNC_SERVER_URL/v1/sync/status")
if ! echo "$SERVER_STATUS" | grep -q "$FILE_ID"; then
    fail "File not found on server"
fi
success "File exists on server"

# Step 5: Soft-delete on server (simulating web UI delete)
log "Soft-deleting file on server..."
DELETE_RESPONSE=$(curl -s -X DELETE "$SYNC_SERVER_URL/v1/sync/files/$FILE_ID")
if ! echo "$DELETE_RESPONSE" | grep -q '"deleted":true'; then
    fail "Server delete failed: $DELETE_RESPONSE"
fi
success "File soft-deleted on server"

# Verify server shows file as deleted
SERVER_STATUS=$(curl -s "$SYNC_SERVER_URL/v1/sync/status")
if ! echo "$SERVER_STATUS" | grep -q '"deleted":true'; then
    fail "Server does not show file as deleted"
fi

# Step 6: Sync down
log "Syncing down from server..."
SYNC_SERVER_URL="$SYNC_SERVER_URL" "$CLI_DIR/dist/bin/jolli" sync down

# Step 7: Verify file is gone locally
if [ -f "test-article.md" ]; then
    fail "File still exists locally after sync down!"
fi
success "Local file was deleted"

# Verify state shows tombstone (YAML format: deleted: true)
if ! grep -q 'deleted: true' .jolli/sync.md; then
    fail "Sync state does not show file as deleted"
fi
success "Sync state shows tombstone"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  E2E SERVER DELETE TEST PASSED!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Summary:"
echo "  - Created file locally"
echo "  - Synced to server"
echo "  - Soft-deleted on server"
echo "  - Synced down"
echo "  - Verified file removed locally"
echo "  - Verified tombstone in sync state"
