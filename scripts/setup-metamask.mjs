#!/usr/bin/env node
/**
 * Fetches the official MetaMask Chrome build for the real-extension checklist (frontend/tests/metamask).
 *
 *   node scripts/setup-metamask.mjs            # default version
 *   node scripts/setup-metamask.mjs 13.52.0
 *
 * Source: github.com/MetaMask/metamask-extension releases. The zip's SHA-256 must match the release's SHA256SUMS,
 * or nothing is unpacked. Output: frontend/.metamask/<version>/ (gitignored). Nothing else is installed.
 */
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = process.argv[2] || '13.52.0';
if (!/^\d+\.\d+\.\d+$/.test(VERSION)) throw new Error(`Not a MetaMask version: ${VERSION}`);
const RELEASE = `https://github.com/MetaMask/metamask-extension/releases/download/v${VERSION}`;
const ZIP = `metamask-chrome-${VERSION}.zip`;
const CACHE = path.join(ROOT, 'frontend', '.metamask');
const DEST = path.join(CACHE, VERSION);
const log = (m) => console.log(`[setup-metamask] ${m}`);

async function download(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const manifest = path.join(DEST, 'manifest.json');
  if (fs.existsSync(manifest) && JSON.parse(fs.readFileSync(manifest, 'utf8')).version.startsWith(VERSION)) {
    log(`MetaMask ${VERSION} already unpacked in ${path.relative(ROOT, DEST)}`);
    return;
  }
  log(`Downloading ${ZIP} and SHA256SUMS from ${RELEASE}`);
  const [zip, sums] = await Promise.all([download(`${RELEASE}/${ZIP}`), download(`${RELEASE}/SHA256SUMS`)]);
  const expected = sums.toString('utf8').split(/\r?\n/).map((l) => l.trim().split(/\s+\*?/)).find(([, name]) => name === ZIP)?.[0];
  const actual = crypto.createHash('sha256').update(zip).digest('hex');
  if (!expected) throw new Error(`${ZIP} is not listed in SHA256SUMS`);
  if (expected !== actual) throw new Error(`Checksum mismatch for ${ZIP}: expected ${expected}, got ${actual}`);
  log(`SHA-256 verified: ${actual}`);

  // Unpack from a fresh directory; the zip is data only (loaded by the browser, never run by Node).
  const dl = path.join(CACHE, 'download');
  fs.mkdirSync(dl, { recursive: true });
  const zipPath = path.join(dl, ZIP);
  fs.writeFileSync(zipPath, zip);
  fs.rmSync(DEST, { recursive: true, force: true });
  fs.mkdirSync(DEST, { recursive: true });
  // bsdtar (Windows 10+, macOS) reads zip; GNU tar does not, so fall back to unzip.
  let r = spawnSync('tar', ['-xf', zipPath, '-C', DEST], { stdio: 'inherit' });
  if (r.status !== 0) r = spawnSync('unzip', ['-q', '-o', zipPath, '-d', DEST], { stdio: 'inherit' });
  if (r.status !== 0 || !fs.existsSync(manifest)) throw new Error('Could not unpack the MetaMask zip (needs bsdtar or unzip)');
  log(`MetaMask ${JSON.parse(fs.readFileSync(manifest, 'utf8')).version} unpacked in ${path.relative(ROOT, DEST)}`);
}

main().catch((err) => {
  console.error(`[setup-metamask] ${err.message}`);
  process.exit(1);
});
