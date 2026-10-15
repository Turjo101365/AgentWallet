const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

// Redact anything shaped like a private key, a bearer token or a signature before it reaches a log.
const PRIVATE_KEY = /0x[0-9a-fA-F]{64}(?![0-9a-fA-F])/g;
const SIGNATURE = /0x[0-9a-fA-F]{130}(?![0-9a-fA-F])/g;
const BEARER = /Bearer\s+[A-Za-z0-9._-]+/gi;

export function redact(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
  if (text === undefined) return text;
  // tx hashes and intent ids are also 32 bytes; keep those readable when explicitly labelled.
  return text
    .replace(SIGNATURE, '0x[signature]')
    .replace(BEARER, 'Bearer [redacted]')
    .replace(/"(privateKey|private_key|AGENT_PRIVATE_KEY|DEPLOYER_PRIVATE_KEY|token)"\s*:\s*"[^"]*"/g, '"$1":"[redacted]"')
    .replace(/(privateKey|AGENT_PRIVATE_KEY)=\S+/g, '$1=[redacted]')
    .replace(/\bkey[:=]\s*0x[0-9a-fA-F]{64}\b/gi, 'key=[redacted]');
}

export function createLogger(level = 'info') {
  const threshold = LEVELS[level] ?? LEVELS.info;
  const write = (lvl, msg, fields) => {
    if (LEVELS[lvl] < threshold) return;
    const line = { level: lvl, time: new Date().toISOString(), msg, ...(fields || {}) };
    const out = redact(line);
    (lvl === 'error' || lvl === 'warn' ? console.error : console.log)(out);
  };
  return {
    debug: (msg, fields) => write('debug', msg, fields),
    info: (msg, fields) => write('info', msg, fields),
    warn: (msg, fields) => write('warn', msg, fields),
    error: (msg, fields) => write('error', msg, fields),
  };
}

export { PRIVATE_KEY as PRIVATE_KEY_PATTERN };
