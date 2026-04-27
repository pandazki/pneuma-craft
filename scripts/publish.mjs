#!/usr/bin/env node
// Pack each workspace package with bun (which rewrites `workspace:*` deps to
// concrete versions), then upload via `npm publish --provenance` so npm's
// trusted publishing OIDC flow attaches build provenance to each release.
//
// Skips packages whose local version already matches the latest on npm.

import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TARBALL_DIR = resolve(ROOT, 'tarballs');

// Topological order — deps first.
const ORDER = ['core', 'timeline', 'video', 'react'];

function run(cmd, opts = {}) {
  return execSync(cmd, { stdio: 'inherit', ...opts });
}

function getRemoteVersion(name) {
  try {
    return execSync(`npm view ${name} version`, { encoding: 'utf8' }).trim();
  } catch {
    return null; // package not yet on npm
  }
}

function readPkg(pkg) {
  const path = resolve(ROOT, 'packages', pkg, 'package.json');
  return JSON.parse(readFileSync(path, 'utf8'));
}

rmSync(TARBALL_DIR, { recursive: true, force: true });
mkdirSync(TARBALL_DIR, { recursive: true });

const toPublish = [];
for (const pkg of ORDER) {
  const json = readPkg(pkg);
  const local = json.version;
  const remote = getRemoteVersion(json.name);
  if (remote === local) {
    console.log(`[skip]    ${json.name}@${local} already on npm`);
    continue;
  }
  console.log(`[publish] ${json.name}@${local} (npm: ${remote ?? 'none'})`);
  toPublish.push({ pkg, name: json.name, version: local });
}

if (toPublish.length === 0) {
  console.log('Nothing to publish.');
  process.exit(0);
}

// Pack everything first so all tarballs see the freshly bumped workspace versions.
for (const { pkg } of toPublish) {
  run(`bun pm pack --destination=${TARBALL_DIR}`, {
    cwd: resolve(ROOT, 'packages', pkg),
  });
}

// Publish in dependency order.
for (const { name, version } of toPublish) {
  // bun pm pack names tarballs like `pneuma-craft-core-0.1.0.tgz`
  const slug = name.replace(/^@/, '').replace('/', '-');
  const tarball = resolve(TARBALL_DIR, `${slug}-${version}.tgz`);
  run(`npm publish ${tarball} --access public --provenance`);
}
