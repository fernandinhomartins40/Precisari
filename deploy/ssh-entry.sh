#!/bin/bash
# Forced command of the deploy SSH key, installed at /usr/local/bin/precisari-deploy.
# The key can only deploy a commit already on origin/main.
set -euo pipefail

sha="${SSH_ORIGINAL_COMMAND:-}"
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo "invalid commit sha" >&2; exit 2; }

exec 9>/run/lock/precisari-deploy.lock
flock 9

cd /opt/precisari
git fetch --quiet origin main
git merge-base --is-ancestor "$sha" origin/main || { echo "commit is not on main" >&2; exit 2; }
git checkout --quiet --force "$sha"
exec deploy/deploy.sh "$sha"
