#!/usr/bin/env node
// Cloud agent sessions ship an older pnpm that downloads the version pinned in `packageManager`
// without running its install step. The downloaded `pnpm` stays a shebang-less placeholder: a shell
// can run it, but turbo spawns it directly and fails with "Exec format error (os error 8)".
// This script finishes that install step (pnpm's own install.js puts the native binary in place).
// Safe to run anywhere: it does nothing when pnpm on PATH is already a real executable.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** @returns {string | undefined} pnpm version pinned in the root package.json */
function pinnedVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const match = /^pnpm@([^+]+)/.exec(pkg.packageManager ?? '');
  return match?.[1];
}

/** Directories that may hold the self-downloaded pnpm: PATH first, then pnpm's default home. */
function candidateDirs() {
  const dirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  const version = pinnedVersion();
  if (version) {
    const homes = [
      process.env.PNPM_HOME,
      process.env.XDG_DATA_HOME && path.join(process.env.XDG_DATA_HOME, 'pnpm'),
      path.join(os.homedir(), '.local', 'share', 'pnpm'),
    ].filter(Boolean);
    for (const home of homes) dirs.push(path.join(home, '.tools', 'pnpm', version, 'bin'));
  }
  return [...new Set(dirs)];
}

/** A placeholder is a text file without a shebang; the real thing is a native binary or a `#!` script. */
function isPlaceholder(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const head = Buffer.alloc(2);
    fs.readSync(fd, head, 0, 2, 0);
    return head[0] === 0x23 && head[1] !== 0x21; // '#' but not '#!'
  } finally {
    fs.closeSync(fd);
  }
}

let fixed = 0;
const seen = new Set();
for (const dir of candidateDirs()) {
  const bin = path.join(dir, 'pnpm');
  if (!fs.existsSync(bin)) continue;
  const real = fs.realpathSync(bin);
  if (seen.has(real)) continue;
  seen.add(real);
  const installer = path.join(path.dirname(real), 'install.js');
  if (!fs.existsSync(installer) || !isPlaceholder(real)) continue;

  const result = spawnSync(process.execPath, [installer], { stdio: 'inherit' });
  if (result.status !== 0 || isPlaceholder(real)) {
    console.error(`fix-pnpm-stub: could not replace the placeholder at ${real}`);
    console.error('Fallback: run ./node_modules/.bin/turbo run typecheck|lint|test directly.');
    process.exit(1);
  }
  console.log(`fix-pnpm-stub: native pnpm installed at ${real}`);
  fixed += 1;
}

if (fixed === 0) console.log('fix-pnpm-stub: pnpm is already executable, nothing to do');
