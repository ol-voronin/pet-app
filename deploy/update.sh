#!/usr/bin/env bash
# Pull deploy (ADR-0009, update 20.11): a systemd timer runs this every 5 minutes as the `deploy` user.
# When `main` on GitHub has a new commit that touches the API, it builds the image here, restarts the stack and
# waits until the API is healthy; an unhealthy build is rolled back to the previous image and not retried.
# The repository is public, so no keys or GitHub secrets are needed. Run by hand with --force to rebuild now.
# Everything is inside main(): bash reads the whole function before `git checkout` can change this file.
set -euo pipefail

main() {
  local dir=${PET_APP_DIR:-/opt/pet-app} image=pet-app-api
  local src=$dir/src
  exec 9>"$dir/.update.lock"
  flock -n 9 || { echo "Another update is running."; return 0; }

  git -C "$src" fetch -q origin main
  local new cur failed
  new=$(git -C "$src" rev-parse origin/main)
  cur=$(cat "$dir/.deployed" 2>/dev/null || true)
  failed=$(cat "$dir/.failed" 2>/dev/null || true)
  if [ "${1:-}" != --force ]; then
    [ "$new" = "$cur" ] && return 0
    [ "$new" = "$failed" ] && return 0
    # Only rebuild when something the server runs has changed.
    if [ -n "$cur" ] && git -C "$src" diff --quiet "$cur" "$new" -- \
      apps/api packages deploy package.json pnpm-lock.yaml pnpm-workspace.yaml .nvmrc .dockerignore; then
      echo "$new" >"$dir/.deployed"
      return 0
    fi
  fi

  echo "Deploying ${new:0:12}"
  git -C "$src" checkout -q --detach "$new"
  local tag=${new:0:12} prev
  if ! docker build -q -f "$src/apps/api/Dockerfile" \
    --build-arg "NODE_IMAGE=node:$(cat "$src/.nvmrc")-slim" -t "$image:$tag" "$src"; then
    echo "$new" >"$dir/.failed"
    echo "Build failed; the running version stays."
    return 1
  fi
  prev=$(docker image inspect "$image:latest" --format '{{.Id}}' 2>/dev/null || true)
  docker tag "$image:$tag" "$image:latest"
  cp "$src/deploy/docker-compose.yml" "$src/deploy/Caddyfile" "$dir/"
  rm -rf "$dir/directus" && cp -r "$src/deploy/directus" "$dir/"
  cd "$dir"
  docker compose up -d --remove-orphans

  local i state
  for i in $(seq 1 45); do
    state=$(docker compose ps api --format '{{.Health}}' 2>/dev/null || true)
    if [ "$state" = healthy ]; then
      echo "$new" >"$dir/.deployed"
      rm -f "$dir/.failed"
      # Keep the two previous images for a manual rollback, drop the rest and old build cache.
      docker images "$image" --format '{{.Tag}}' | grep -v -e latest -e "$tag" | tail -n +3 |
        xargs -r -I{} docker rmi "$image:{}" >/dev/null || true
      docker builder prune -f --filter until=168h >/dev/null 2>&1 || true
      echo "Healthy: ${new:0:12}"
      return 0
    fi
    sleep 2
  done

  docker compose logs --tail 50 api || true
  echo "$new" >"$dir/.failed"
  if [ -n "$prev" ]; then
    docker tag "$prev" "$image:latest"
    docker compose up -d
    echo "Not healthy; rolled back to the previous image."
  fi
  return 1
}

main "$@"; exit $?
