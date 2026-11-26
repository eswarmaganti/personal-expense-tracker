#!/usr/bin/env bash
# run.sh — fetch the latest GitHub release tag and (re)start the application
# via docker-compose.release.yml.
#
# Usage:
#   ./scripts/run.sh                   # auto-detect latest release
#   ./scripts/run.sh v1.2.0            # pin to a specific tag
#   GITHUB_TOKEN=ghp_... ./scripts/run.sh  # authenticated (higher rate-limit)
#
# Idempotent: if the stack is already running it is gracefully stopped before
# the new version is started.

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
REPO="eswarmaganti/personal-expense-tracker"
COMPOSE_FILE="$(cd "$(dirname "$0")" && pwd)/docker-compose.release.yml"
PROJECT_NAME="expense-tracker"

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
die()     { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

# ── Dependency checks ─────────────────────────────────────────────────────────
command -v docker  >/dev/null 2>&1 || die "docker is not installed or not in PATH"
command -v curl    >/dev/null 2>&1 || die "curl is not installed or not in PATH"

# Prefer 'docker compose' (v2 plugin) over legacy 'docker-compose'
if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  die "Neither 'docker compose' nor 'docker-compose' found"
fi

# ── Resolve release tag ───────────────────────────────────────────────────────
if [[ "${1:-}" != "" ]]; then
  RELEASE_TAG="$1"
  info "Using pinned tag: ${RELEASE_TAG}"
else
  info "Fetching latest release from GitHub…"

  CURL_ARGS=(-fsSL -H "Accept: application/vnd.github+json")
  if [[ -n "${GITHUB_TOKEN:-}" ]]; then
    CURL_ARGS+=(-H "Authorization: Bearer ${GITHUB_TOKEN}")
  fi

  API_URL="https://api.github.com/repos/${REPO}/releases/latest"
  RELEASE_JSON="$(curl "${CURL_ARGS[@]}" "${API_URL}" 2>/dev/null)" \
    || die "Failed to reach GitHub API. Check your network or set GITHUB_TOKEN for auth."

  RELEASE_TAG="$(echo "${RELEASE_JSON}" | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')"
  [[ -n "${RELEASE_TAG}" ]] || die "Could not parse tag_name from GitHub API response."

  success "Latest release: ${RELEASE_TAG}"
fi

export RELEASE_TAG

# ── Stop existing stack (idempotent) ─────────────────────────────────────────
info "Checking for a running stack…"
RUNNING="$(${COMPOSE} -f "${COMPOSE_FILE}" -p "${PROJECT_NAME}" ps --services --filter status=running 2>/dev/null || true)"

if [[ -n "${RUNNING}" ]]; then
  warn "Stack is running (services: $(echo "${RUNNING}" | tr '\n' ' ')). Stopping gracefully…"
  ${COMPOSE} -f "${COMPOSE_FILE}" -p "${PROJECT_NAME}" down --remove-orphans --timeout 30
  success "Previous stack stopped."
else
  info "No running stack found — starting fresh."
fi

# ── Pull images ───────────────────────────────────────────────────────────────
info "Pulling images for ${RELEASE_TAG}…"
${COMPOSE} -f "${COMPOSE_FILE}" -p "${PROJECT_NAME}" pull

# ── Start ─────────────────────────────────────────────────────────────────────
info "Starting stack at ${RELEASE_TAG}…"
${COMPOSE} -f "${COMPOSE_FILE}" -p "${PROJECT_NAME}" up -d --remove-orphans

success "Application is up!"
echo ""
echo -e "  Frontend  →  ${CYAN}http://localhost${NC}"
echo -e "  API       →  ${CYAN}http://localhost:8000${NC}"
echo -e "  Swagger   →  ${CYAN}http://localhost:8000/docs${NC}"
echo -e "  Release   →  ${CYAN}${RELEASE_TAG}${NC}"
echo ""
echo "  Logs:  ${COMPOSE} -f ${COMPOSE_FILE} -p ${PROJECT_NAME} logs -f"
echo "  Stop:  ${COMPOSE} -f ${COMPOSE_FILE} -p ${PROJECT_NAME} down"
