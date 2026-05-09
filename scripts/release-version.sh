#!/usr/bin/env bash
# Used by .github/workflows/release.yml — changesets/action invokes this
# without a shell, so chained commands have to live inside a real script.
set -euo pipefail

bunx changeset version
bun install --no-frozen-lockfile
