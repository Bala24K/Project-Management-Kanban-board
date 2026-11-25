#!/usr/bin/env bash
# Deploys one commit on the EC2 server. Runs ON the server: the GitHub Actions
# workflow pipes this file over SSH (see .github/workflows/ci-cd.yml).
#
#   usage: bash deploy.sh <commit-sha>
#
# Builds the image first (the old version keeps serving meanwhile), swaps the
# container, waits for /api/health, and rolls back to the previous image if
# the new one does not become healthy.
set -euo pipefail

SHA="${1:?usage: deploy.sh <commit-sha>}"
APP_DIR="$HOME/flowboard"
ENV_FILE="$HOME/flowboard.env"
NAME="flowboard"
# Bound to localhost: Caddy terminates HTTPS on 80/443 and proxies to :4000.
PORTS="127.0.0.1:4000:4000"

start() {
  sudo docker run -d --name "$NAME" --restart unless-stopped -p "$PORTS" --env-file "$ENV_FILE" "$1" >/dev/null
}

healthy() {
  for _ in $(seq 1 45); do
    if curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  return 1
}

echo "==> Checking out $SHA"
cd "$APP_DIR"
git fetch --quiet origin
git checkout --quiet --force "$SHA"

echo "==> Building image flowboard:$SHA (current version keeps running)"
sudo docker build --quiet -t "flowboard:$SHA" . >/dev/null

PREVIOUS="$(sudo docker inspect --format '{{.Config.Image}}' "$NAME" 2>/dev/null || true)"

echo "==> Restarting container (previous image: ${PREVIOUS:-none})"
sudo docker rm -f "$NAME" >/dev/null 2>&1 || true
start "flowboard:$SHA"

echo "==> Waiting for health check"
if healthy; then
  sudo docker tag "flowboard:$SHA" flowboard:latest
  # Keep only the image now running; remove older per-commit tags and dangling layers.
  sudo docker images flowboard --format '{{.Tag}}' | grep -vE "^(latest|$SHA)$" \
    | xargs -r -I{} sudo docker rmi "flowboard:{}" >/dev/null 2>&1 || true
  sudo docker image prune -f >/dev/null
  echo "==> Deployed $SHA"
  exit 0
fi

echo "!! New version failed its health check. Last log lines:"
sudo docker logs --tail 60 "$NAME" || true
sudo docker rm -f "$NAME" >/dev/null 2>&1 || true
if [ -n "$PREVIOUS" ]; then
  echo "==> Rolling back to $PREVIOUS"
  start "$PREVIOUS"
  healthy && echo "==> Rollback healthy" || echo "!! Rollback also unhealthy"
fi
exit 1
