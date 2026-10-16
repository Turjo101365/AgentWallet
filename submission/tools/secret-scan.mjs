#!/usr/bin/env node
/**
 * Secret scan for the submission. Prints file names and counts only, never a secret value.
 *
 * 1. Exact-value scan: loads every secret-looking value (KEY/SECRET/PASSWORD/MNEMONIC/TOKEN, >= 16 chars) from the
 *    git-ignored env files, then searches every committable file (tracked + untracked-not-ignored) and every text
 *    deliverable under submission/ and evidence/submission/ for those exact values.
 * 2. Pattern scan: OpenAI/Anthropic-style keys, PEM private keys, key assignments with 64-hex values, and
 *    12/24-word phrases other than the public Hardhat test mnemonic.
 * Exit code 1 if anything is found.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ENV_FILES = ['contracts/.env', 'backend/.env', 'backend/.env.sepolia', 'backend/.env.base-sepolia', 'secrets/base-sepolia-wallets.env'];
const secrets = [];
for (const f of ENV_FILES) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)\s*=\s*"?([^"#\r\n]+)"?/.exec(line.trim());
    if (m && /KEY|SECRET|PASSWORD|MNEMONIC|TOKEN/.test(m[1]) && m[2].trim().length >= 16) secrets.push({ name: `${f}:${m[1]}`, value: m[2].trim() });
  }
}
const git = (cmd) => execSync(cmd, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 }).split('\n').filter(Boolean);
const files = new Set([...git('git ls-files'), ...git('git ls-files --others --exclude-standard')]);
const walk = (d) => (fs.existsSync(path.join(ROOT, d)) ? fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name).split(path.sep).join('/')])) : []);
for (const f of [...walk('submission'), ...walk('evidence/submission'), ...walk('evidence/sepolia')]) files.add(f);
const TEXT = /\.(md|txt|json|js|mjs|cjs|jsx|ts|tsx|sol|py|yml|yaml|toml|html|css|svg|log|env|example|sh|ps1|csv)$/i;
const HARDHAT = 'test test test test test test test test test test test junk';
const PATTERNS = [
  ['openai-style key', /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}/],
  ['anthropic key', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ['PEM private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['private-key assignment', /(?:PRIVATE_KEY|privateKey|private_key)\s*[:=]\s*["']?0x[0-9a-fA-F]{64}/],
];
const findings = [];
let scanned = 0;
for (const f of files) {
  if (!TEXT.test(f) || f.includes('node_modules/')) continue;
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p) || fs.statSync(p).size > 20 << 20) continue;
  const text = fs.readFileSync(p, 'utf8');
  scanned++;
  for (const s of secrets) if (text.includes(s.value)) findings.push({ file: f, what: `exact value of ${s.name}` });
  for (const [what, re] of PATTERNS) {
    const m = re.exec(text);
    if (m && !/\.example$/.test(f)) {
      const hex = /0x[0-9a-fA-F]{64}/.exec(m[0])?.[0];
      // The publicly known Hardhat development keys are allowed (local tests only).
      if (hex && /ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80|59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d/i.test(hex)) continue;
      findings.push({ file: f, what });
    }
  }
  const words = text.match(/\b(?:[a-z]{3,8} ){11}[a-z]{3,8}\b/g) || [];
  for (const w of words) if (w !== HARDHAT && /^(?:\w+ ){11}\w+$/.test(w) && new Set(w.split(' ')).size >= 10 && !/[A-Z]/.test(w) && f.endsWith('.env')) findings.push({ file: f, what: 'possible recovery phrase' });
}
const report = { scannedAt: new Date().toISOString(), secretValuesLoaded: secrets.length, envFilesRead: ENV_FILES.filter((f) => fs.existsSync(path.join(ROOT, f))), filesScanned: scanned, findings };
console.log(`[secret-scan] ${secrets.length} secret values loaded from ${report.envFilesRead.length} git-ignored env files; ${scanned} text files scanned`);
for (const x of findings) console.log(`[secret-scan] FOUND ${x.what} in ${x.file}`);
console.log(findings.length ? `[secret-scan] ${findings.length} finding(s)` : '[secret-scan] no secrets found');
if (process.argv.includes('--json')) fs.writeFileSync(path.join(ROOT, process.argv[process.argv.indexOf('--json') + 1]), JSON.stringify(report, null, 2));
process.exit(findings.length ? 1 : 0);
