#!/bin/bash
set -euo pipefail

# To be run from local machine
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
IMAGE_BASE="ghcr.io/rebolyte/loom"

# Source .env for VPS credentials
if [[ ! -f "$PROJECT_ROOT/.env" ]]; then
    echo "Error: .env file not found"
    exit 1
fi
source "$PROJECT_ROOT/.env"

if [[ -z "${VPS_IP:-}" ]] || [[ -z "${VPS_USER:-}" ]]; then
    echo "Error: VPS_IP and VPS_USER must be set in .env"
    exit 1
fi

if [[ -n $(git status -s) ]]; then
    echo "Error: There are uncommitted changes in the working directory"
    echo "Please commit or stash your changes before deploying"
    exit 1
fi

CURRENT_BRANCH=$(git -C "$PROJECT_ROOT" rev-parse --abbrev-ref HEAD)
if [[ "$CURRENT_BRANCH" != "main" ]]; then
    echo "Error: Must be on main branch to deploy"
    exit 1
fi

# Calculate calver: YYYY.MM.patch
CURRENT_VERSION=$(bun -e "console.log(require('$PROJECT_ROOT/package.json').version)")
YEAR_MONTH="$(date +%Y).$(date +%m)"

if [[ "$CURRENT_VERSION" == "$YEAR_MONTH."* ]]; then
    PATCH=$(echo "$CURRENT_VERSION" | cut -d. -f3)
    VERSION="$YEAR_MONTH.$((PATCH + 1))"
else
    VERSION="$YEAR_MONTH.1"
fi

echo "Version: $CURRENT_VERSION -> $VERSION"

# Update package.json version
cd "$PROJECT_ROOT" && bun -e "
const fs = require('fs');
const path = '$PROJECT_ROOT/package.json';
const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));
pkg.version = '$VERSION';
fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
"

# Commit version bump locally
git -C "$PROJECT_ROOT" add package.json
git -C "$PROJECT_ROOT" commit -m "chore: bump version to $VERSION"

# Create git tag locally
TAG="v$VERSION"
git -C "$PROJECT_ROOT" tag "$TAG" -m ""

cleanup_on_failure() {
    echo "Build failed, rolling back local commit and tag..."
    git -C "$PROJECT_ROOT" tag -d "$TAG" 2>/dev/null || true
    git -C "$PROJECT_ROOT" reset --soft HEAD~1
    git -C "$PROJECT_ROOT" restore --staged package.json
    git -C "$PROJECT_ROOT" restore package.json
}
trap cleanup_on_failure ERR

# Build and push Docker images
docker build --platform linux/amd64 -t "$IMAGE_BASE:$VERSION" -t "$IMAGE_BASE:latest" "$PROJECT_ROOT"
docker push "$IMAGE_BASE:$VERSION"
docker push "$IMAGE_BASE:latest"

# Push commit and tag after successful docker build
git -C "$PROJECT_ROOT" push origin HEAD
git -C "$PROJECT_ROOT" push origin "$TAG"

# clear trap
trap - ERR

# Create GitHub release
gh release create "$TAG" --title "Release $TAG" --generate-notes

# Deploy to VPS
ssh -p ${VPS_SSH_PORT:-22} ${VPS_USER}@${VPS_IP} "COMPOSE_DIR=${VPS_COMPOSE_DIR} bash -s" < "$SCRIPT_DIR/restart-container.sh"

echo "Deployed $TAG!"
