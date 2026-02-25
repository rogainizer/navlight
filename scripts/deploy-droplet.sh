#!/usr/bin/env bash
set -euo pipefail

: "${DROPLET_IP?Set DROPLET_IP to the droplet hostname or IP}" 
: "${DROPLET_USER?Set DROPLET_USER to the SSH username}" 
REMOTE_PATH=${REMOTE_PATH:-/opt/navlight}
COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.prod.yml}
ENV_FILE=${ENV_FILE:-deploy/.env.production}
SSH_OPTS=${SSH_OPTS:--o StrictHostKeyChecking=no}

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "Compose file '$COMPOSE_FILE' not found" >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Environment file '$ENV_FILE' not found" >&2
  exit 1
fi

SSH_TARGET="${DROPLET_USER}@${DROPLET_IP}"

ssh $SSH_OPTS "$SSH_TARGET" "mkdir -p $REMOTE_PATH"

scp $SSH_OPTS "$COMPOSE_FILE" "$SSH_TARGET:$REMOTE_PATH/docker-compose.yml"
scp $SSH_OPTS "$ENV_FILE" "$SSH_TARGET:$REMOTE_PATH/.env"

ssh $SSH_OPTS "$SSH_TARGET" <<"EOF"
set -euo pipefail
cd "$REMOTE_PATH"
docker compose pull
docker compose up -d --remove-orphans
EOF

ssh $SSH_OPTS "$SSH_TARGET" docker image prune -f >/dev/null 2>&1 || true

echo "Deployment complete."
