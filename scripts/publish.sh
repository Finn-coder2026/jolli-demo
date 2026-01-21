#!/bin/bash
set -e

BUCKET="jolli-builds"
BRANCH=$(git rev-parse --abbrev-ref HEAD)

# Publish jolli-web
NAME=$(jq -r '.name' dist/package.json)
VERSION=$(jq -r '.version' dist/package.json)
PACKAGE=$(jq -r '.package' dist/package.json)

KEY="$NAME/$VERSION/$PACKAGE"
DEST="s3://$BUCKET/$KEY"
PARAM="/build/$NAME/$BRANCH"

aws s3api head-object --bucket "$BUCKET" --key "$KEY" 2> /dev/null || aws s3 cp "$PACKAGE" "$DEST"
aws ssm put-parameter --name "$PARAM" --value "$DEST" --type String --overwrite

# Publish jolli-manager
MANAGER_NAME=$(jq -r '.name' manager-dist/package.json)
MANAGER_VERSION=$(jq -r '.version' manager-dist/package.json)
MANAGER_PACKAGE=$(jq -r '.package' manager-dist/package.json)

MANAGER_KEY="$MANAGER_NAME/$MANAGER_VERSION/$MANAGER_PACKAGE"
MANAGER_DEST="s3://$BUCKET/$MANAGER_KEY"
MANAGER_PARAM="/build/$MANAGER_NAME/$BRANCH"

aws s3api head-object --bucket "$BUCKET" --key "$MANAGER_KEY" 2> /dev/null || aws s3 cp "$MANAGER_PACKAGE" "$MANAGER_DEST"
aws ssm put-parameter --name "$MANAGER_PARAM" --value "$MANAGER_DEST" --type String --overwrite
