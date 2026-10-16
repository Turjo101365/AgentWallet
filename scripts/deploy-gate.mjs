/**
 * The public-deployment gate: CONFIRM_PUBLIC_DEPLOY in contracts/.env. A run may only start with it at "yes",
 * and must always leave it at "no", whether the run succeeded, failed, or was interrupted.
 */
import fs from 'node:fs';

export function deployGate(file) {
  const m = /^CONFIRM_PUBLIC_DEPLOY=(.*)$/m.exec(fs.readFileSync(file, 'utf8'));
  return m ? m[1].trim() : null;
}

/** Sets CONFIRM_PUBLIC_DEPLOY=no (adding the line if missing). Touches nothing else in the file. */
export function resetDeployGate(file) {
  const text = fs.readFileSync(file, 'utf8');
  const next = /^CONFIRM_PUBLIC_DEPLOY=.*$/m.test(text)
    ? text.replace(/^CONFIRM_PUBLIC_DEPLOY=.*$/m, 'CONFIRM_PUBLIC_DEPLOY=no')
    : `${text}${text.endsWith('\n') || !text ? '' : '\n'}CONFIRM_PUBLIC_DEPLOY=no\n`;
  if (next !== text) fs.writeFileSync(file, next);
  return deployGate(file);
}
