# Changesets

This directory holds [changesets](https://github.com/changesets/changesets) — small markdown files describing what changed in a PR. Each PR that ships user-visible changes should add a changeset.

## Adding a changeset

```bash
bun changeset
```

The CLI walks you through:

1. Picking which packages this change affects
2. Picking the bump type — `patch` / `minor` / `major` per package
3. Writing a one-line summary (markdown allowed)

It writes a `<random-name>.md` file here. Commit it with your PR.

## What happens after merge

When changesets land on `main`, the GitHub Actions release workflow opens (or updates) a "Version Packages" PR that:

- Bumps versions in each affected `packages/*/package.json`
- Updates each `CHANGELOG.md`
- Removes the consumed changesets

When you merge that PR, CI runs `bun run release`, which packs and publishes the bumped packages to npm.
