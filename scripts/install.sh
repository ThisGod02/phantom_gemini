#!/usr/bin/env bash
set -euo pipefail

# Phantom Install Script
# Works on a fresh Ubuntu 22.04+ / Debian 12+ machine with zero manual steps.
# Usage:
#   curl -sSL https://raw.githubusercontent.com/ghostwright/phantom/main/scripts/install.sh | bash
#   bash install.sh --yes
#   ANTHROPIC_API_KEY=sk-ant-... SLACK_BOT_TOKEN=xoxb-... bash install.sh --yes

PHANTOM_REPO="https://github.com/ghostwright/phantom.git"
INSTALL_DIR="${PHANTOM_INSTALL_DIR:-/opt/phantom}"
PHANTOM_USER="${PHANTOM_USER:-phantom}"
SERVICE_NAME="phantom"
HEALTH_PORT="${PORT:-3100}"

# Flags
YES_MODE=false
SKIP_SYSTEMD=false

for arg in "$@"; do
  case "$arg" in
    --yes|-y) YES_MODE=true ;;
    --path=*) INSTALL_DIR="${arg#*=}" ;;
    --skip-systemd) SKIP_SYSTEMD=true ;;
    --help|-h) show_help=true ;;
  esac
done

# ---------- Colors and output ----------

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${CYAN}[*]${NC} $1"; }
success() { echo -e "${GREEN}[+]${NC} $1"; }
warn()    { echo -e "${YELLOW}[!]${NC} $1"; }
error()   { echo -e "${RED}[x]${NC} $1" >&2; }
step()    { echo -e "\n${BOLD}--- $1 ---${NC}"; }

if [ "${show_help:-}" = true ]; then
  echo "Phantom Install Script"
  echo ""
  echo "Usage: bash install.sh [options]"
  echo ""
  echo "Options:"
  echo "  --yes, -y          Non-interactive mode (no prompts)"
  echo "  --path=<dir>       Install directory (default: /opt/phantom)"
  echo "  --skip-systemd     Skip systemd service creation"
  echo "  -h, --help         Show this help"
  echo ""
  echo "Environment variables:"
  echo "  ANTHROPIC_API_KEY   (required) Anthropic API key"
  echo "  SLACK_BOT_TOKEN     Slack bot token (xoxb-...)"
  echo "  SLACK_APP_TOKEN     Slack app token (xapp-...)"
  echo "  SLACK_CHANNEL_ID    Default Slack channel for intro message"
  echo "  PHANTOM_NAME        Agent name (default: hostname or 'phantom')"
  echo "  PHANTOM_ROLE        Agent role (default: swe)"
  echo "  PORT                HTTP port (default: 3100)"
  exit 0
fi

# ---------- Pre-flight checks ----------

step "Pre-flight checks"

if [[ "$OSTYPE" == "darwin"* ]]; then
  error "macOS detected. This script is for Linux servers."
  error "For local development, clone the repo and run 'bun install' directly."
  exit 1
fi

if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
  error "Windows detected. This script is for Linux servers."
  exit 1
fi

if [ "$(id -u)" -ne 0 ]; then
  error "This script must be run as root (or with sudo)."
  error "Try: sudo bash install.sh $*"
  exit 1
fi

# ---------- Install git ----------

if ! command -v git &> /dev/null; then
  info "Installing git..."
  apt-get update -qq && apt-get install -y -qq git curl > /dev/null 2>&1
  success "git installed"
else
  success "git found: $(git --version)"
fi

# ---------- Install Docker ----------

if ! command -v docker &> /dev/null; then
  info "Installing Docker..."
  curl -fsSL https://get.docker.com | bash > /dev/null 2>&1
  systemctl enable docker
  systemctl start docker
  success "Docker installed: $(docker --version)"
elif ! systemctl is-active --quiet docker 2>/dev/null; then
  warn "Docker installed but not running. Starting..."
  systemctl start docker
  success "Docker started"
else
  success "Docker found: $(docker --version)"
fi

# Ensure docker compose plugin is available
if ! docker compose version &> /dev/null; then
  info "Installing Docker Compose plugin..."
  apt-get update -qq && apt-get install -y -qq docker-compose-plugin > /dev/null 2>&1
  success "Docker Compose plugin installed"
fi

# ---------- Install Bun ----------

if ! command -v bun &> /dev/null; then
  info "Installing Bun..."
  curl -fsSL https://bun.sh/install | bash > /dev/null 2>&1
  # Bun installs to ~/.bun/bin/bun. Copy to /usr/local/bin for system-wide access.
  if [ -f /root/.bun/bin/bun ]; then
    cp /root/.bun/bin/bun /usr/local/bin/bun
  elif [ -f "$HOME/.bun/bin/bun" ]; then
    cp "$HOME/.bun/bin/bun" /usr/local/bin/bun
  fi
  success "Bun installed: $(/usr/local/bin/bun --version)"
elif ! /usr/local/bin/bun --version > /dev/null 2>&1; then
  warn "Bun binary appears broken. Reinstalling..."
  curl -fsSL https://bun.sh/install | bash > /dev/null 2>&1
  if [ -f /root/.bun/bin/bun ]; then
    cp /root/.bun/bin/bun /usr/local/bin/bun
  fi
  success "Bun reinstalled: $(/usr/local/bin/bun --version)"
else
  success "Bun found: $(bun --version)"
fi

# ---------- Clone or update Phantom ----------

step "Installing Phantom"

if [ -d "$INSTALL_DIR/.git" ]; then
  info "Phantom already cloned at $INSTALL_DIR. Updating..."
  cd "$INSTALL_DIR"
  git pull origin main --ff-only 2>/dev/null || git pull origin main
  success "Updated to latest"
else
  # Preserve .env if it exists (cloud-init or previous install may have written it)
  if [ -f "$INSTALL_DIR/.env" ]; then
    cp "$INSTALL_DIR/.env" /tmp/phantom-env-backup
  fi

  info "Cloning Phantom to $INSTALL_DIR..."
  # Clone to a temp location first, then move to install dir
  rm -rf /tmp/phantom-clone
  git clone --depth 1 "$PHANTOM_REPO" /tmp/phantom-clone

  # Ensure install dir exists
  mkdir -p "$INSTALL_DIR"

  # Copy all files from clone into install dir (including dotfiles)
  cd /tmp/phantom-clone
  find . -maxdepth 1 -not -name '.' -not -name '..' | while read f; do
    rm -rf "${INSTALL_DIR}/$f" 2>/dev/null || true
    cp -a "$f" "${INSTALL_DIR}/"
  done
  rm -rf /tmp/phantom-clone

  # Restore .env if it was preserved
  if [ -f /tmp/phantom-env-backup ]; then
    cp /tmp/phantom-env-backup "$INSTALL_DIR/.env"
    rm -f /tmp/phantom-env-backup
  fi

  success "Cloned to $INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# ---------- Install dependencies ----------

info "Installing dependencies..."
/usr/local/bin/bun install --production 2>&1 | tail -1
success "Dependencies installed"

# ---------- Start Docker services ----------

step "Starting Docker services"

info "Starting Qdrant and Ollama..."
docker compose up -d 2>&1 | tail -2 || true

# Wait for Qdrant health
info "Waiting for Qdrant..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:6333/ > /dev/null 2>&1; then
    break
  fi
  sleep 1
done
if curl -sf http://localhost:6333/ > /dev/null 2>&1; then
  success "Qdrant is ready"
else
  warn "Qdrant not responding after 30s. Phantom will retry on startup."
fi

# Wait for Ollama health
info "Waiting for Ollama..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:11434/api/tags > /dev/null 2>&1; then
    break
  fi
  sleep 1
done
if curl -sf http://localhost:11434/api/tags > /dev/null 2>&1; then
  success "Ollama is ready"
else
  warn "Ollama not responding after 30s. Continuing without embedding model."
fi

# Pull embedding model
info "Pulling nomic-embed-text model (this may take a minute)..."
if docker exec phantom-ollama ollama pull nomic-embed-text 2>&1 | tail -1; then
  success "Embedding model ready"
else
  warn "Model pull failed. Phantom will run without vector memory."
fi

# ---------- Write .env if needed ----------

# If tokens are in the environment but not in a .env file, write them
if [ -n "${ANTHROPIC_API_KEY:-}" ] && [ ! -f "$INSTALL_DIR/.env" ]; then
  info "Writing environment variables to .env..."
  {
    echo "ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}"
    [ -n "${SLACK_BOT_TOKEN:-}" ] && echo "SLACK_BOT_TOKEN=${SLACK_BOT_TOKEN}"
    [ -n "${SLACK_APP_TOKEN:-}" ] && echo "SLACK_APP_TOKEN=${SLACK_APP_TOKEN}"
    [ -n "${SLACK_CHANNEL_ID:-}" ] && echo "SLACK_CHANNEL_ID=${SLACK_CHANNEL_ID}"
    [ -n "${SLACK_USER_ID:-}" ] && echo "SLACK_USER_ID=${SLACK_USER_ID}"
    [ -n "${PHANTOM_NAME:-}" ] && echo "PHANTOM_NAME=${PHANTOM_NAME}"
    [ -n "${PHANTOM_ROLE:-}" ] && echo "PHANTOM_ROLE=${PHANTOM_ROLE}"
    [ -n "${PORT:-}" ] && echo "PORT=${PORT}"
  } > "$INSTALL_DIR/.env"
  chmod 600 "$INSTALL_DIR/.env"
  success ".env written"
fi

# Source .env for the init command
if [ -f "$INSTALL_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$INSTALL_DIR/.env"
  set +a
fi

# ---------- Initialize Phantom ----------

step "Initializing Phantom"

if [ -f "$INSTALL_DIR/config/phantom.yaml" ]; then
  info "Phantom already initialized (config/phantom.yaml exists). Skipping init."
else
  info "Running phantom init --yes..."
  cd "$INSTALL_DIR"
  /usr/local/bin/bun run phantom init --yes 2>&1
  success "Phantom initialized"
fi

# ---------- Create systemd service ----------

if [ "$SKIP_SYSTEMD" = false ]; then
  step "Setting up systemd service"

  cat > /etc/systemd/system/${SERVICE_NAME}.service << 'SVCEOF'
[Unit]
Description=Phantom AI Agent
After=network.target docker.service
Wants=docker.service
StartLimitBurst=5
StartLimitIntervalSec=300

[Service]
Type=simple
WorkingDirectory=/opt/phantom
ExecStart=/usr/local/bin/bun run start
Restart=always
RestartSec=10
EnvironmentFile=-/opt/phantom/.env
StandardOutput=journal
StandardError=journal
SyslogIdentifier=phantom

NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/opt/phantom
PrivateTmp=true
MemoryMax=2G
MemoryHigh=1536M
TasksMax=256

[Install]
WantedBy=multi-user.target
SVCEOF

  # Update WorkingDirectory and EnvironmentFile if custom path
  if [ "$INSTALL_DIR" != "/opt/phantom" ]; then
    sed -i "s|/opt/phantom|${INSTALL_DIR}|g" /etc/systemd/system/${SERVICE_NAME}.service
  fi

  systemctl daemon-reload
  systemctl enable ${SERVICE_NAME}
  success "systemd service created and enabled"

  # Start or restart
  if systemctl is-active --quiet ${SERVICE_NAME}; then
    info "Restarting Phantom..."
    systemctl restart ${SERVICE_NAME}
  else
    info "Starting Phantom..."
    systemctl start ${SERVICE_NAME}
  fi

  # Wait for health
  info "Waiting for Phantom to be ready..."
  HEALTHY=false
  for i in $(seq 1 60); do
    if curl -sf "http://localhost:${HEALTH_PORT}/health" > /dev/null 2>&1; then
      HEALTHY=true
      break
    fi
    sleep 1
  done

  if [ "$HEALTHY" = true ]; then
    success "Phantom is healthy"
  else
    warn "Phantom did not respond on port ${HEALTH_PORT} within 60 seconds."
    warn "Check logs: journalctl -u ${SERVICE_NAME} -f"
  fi
fi

# ---------- Summary ----------

step "Installation Complete"

echo ""
success "Phantom is installed at ${INSTALL_DIR}"

if [ "$SKIP_SYSTEMD" = false ] && [ "$HEALTHY" = true ]; then
  HEALTH_RESPONSE=$(curl -sf "http://localhost:${HEALTH_PORT}/health" 2>/dev/null || echo "{}")
  echo ""
  info "Health: ${HEALTH_RESPONSE}"
fi

echo ""
info "Useful commands:"
echo "  journalctl -u ${SERVICE_NAME} -f     # Follow logs"
echo "  systemctl restart ${SERVICE_NAME}     # Restart"
echo "  systemctl status ${SERVICE_NAME}      # Status"
echo "  curl localhost:${HEALTH_PORT}/health  # Health check"

if [ -n "${SLACK_BOT_TOKEN:-}" ] && [ -n "${SLACK_APP_TOKEN:-}" ]; then
  echo ""
  success "Slack is configured. Check your Slack channel for Phantom's intro message."
fi

echo ""
