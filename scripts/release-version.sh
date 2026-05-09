#!/usr/bin/env bash
# Used by .github/workflows/release.yml — changesets/action invokes this
# without a shell, so chained commands have to live inside a real script.
set -euo pipefail

bunx changeset version

# Nuke the lockfile before re-installing because `bun install
# --no-frozen-lockfile` does NOT refresh the `version` field of
# workspace package entries when only those versions changed (see
# https://github.com/oven-sh/bun/issues — observed 1.3.x). If we skip
# this, `bun pm pack` later resolves `workspace:*` against the stale
# lockfile and writes OLD sibling-package versions into published
# tarballs (this bit us once: video@0.5.0 shipped depending on
# timeline@0.3.0). Deleting and re-installing forces bun to walk the
# fresh package.json files.
rm -f bun.lock
bun install
