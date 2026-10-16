#!/usr/bin/env node
/**
 * Screen-records the LIVE output of a real command in a large, readable terminal page (1920x1080).
 *
 *   node submission/tools/live-terminal.mjs --name audit --title "…" [--cwd dir] -- node submission/tools/verify-audit-chain.mjs
 *
 * The command is spawned for real; its stdout/stderr bytes are streamed to the page as they arrive (Server-Sent
 * Events) and rendered with their ANSI colours. Nothing is pre-written: the header shows the exact command, the
 * working directory and the start time, and the footer shows the real exit code and duration when it ends.
 * Output: evidence/submission/footage/term-<name>.webm, term-<name>.log (the raw text) and term-<name>.json (timing).
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { chromium } = createRequire(path.join(ROOT, 'frontend', 'package.json'))('@playwright/test');
const argv = process.argv.slice(2);
const sep = argv.indexOf('--');
const opts = argv.slice(0, sep);
const cmd = argv.slice(sep + 1);
const opt = (f, d) => (opts.includes(f) ? opts[opts.indexOf(f) + 1] : d);
const name = opt('--name', 'cmd');
const title = opt('--title', cmd.join(' '));
const cwd = path.resolve(ROOT, opt('--cwd', '.'));
const fontPx = Number(opt('--font', '19'));
const OUT = path.join(ROOT, 'evidence', 'submission', 'footage');
fs.mkdirSync(OUT, { recursive: true });

const clients = new Set();
const buffered = [];
let raw = '';
const send = (event, data) => { const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`; buffered.push(msg); for (const c of clients) c.write(msg); };
const display = cmd.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ').replace(process.execPath, 'node');
const page = `<!doctype html><html><head><meta charset="utf-8"><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Fustat:wght@500;700&display=swap" rel="stylesheet">
<style>html,body{margin:0;height:100%;background:#121411}body{display:flex;flex-direction:column;font-family:'JetBrains Mono',monospace;color:#e8e8e2}
.bar{display:flex;align-items:center;gap:14px;padding:18px 28px;background:#1c1f1b;border-bottom:1px solid #2b2f2a;font-family:Fustat,sans-serif}
.dots span{display:inline-block;width:13px;height:13px;border-radius:50%;margin-right:7px}.t{font-weight:700;font-size:20px}.live{margin-left:auto;font:600 13px 'JetBrains Mono';letter-spacing:.12em;color:#9fdcb8}
.meta{padding:14px 28px 6px;font-size:15px;color:#9a9a92}.cmd{padding:4px 28px 14px;font-size:${fontPx + 1}px;color:#fff}.cmd b{color:#9fdcb8}
#o{flex:1;overflow:hidden;padding:6px 28px 20px;font-size:${fontPx}px;line-height:1.5;white-space:pre-wrap;word-break:break-all}
.foot{padding:14px 28px;background:#1c1f1b;border-top:1px solid #2b2f2a;font-size:15px;color:#9a9a92}.ok{color:#7fd6a4}.bad{color:#f5a08a}
.c31{color:#f5a08a}.c32{color:#7fd6a4}.c33{color:#f0d77a}.c36{color:#8fc8f0}.c90,.c2{color:#8a8a82}.c1{font-weight:700}</style></head><body>
<div class="bar"><span class="dots"><span style="background:#f5a08a"></span><span style="background:#f0d77a"></span><span style="background:#7fd6a4"></span></span><span class="t">${title.replace(/</g, '&lt;')}</span><span class="live" id="live">● LIVE OUTPUT</span></div>
<div class="meta">${cwd.replace(/\\/g, '/').replace(/</g, '&lt;')} · started <span id="st"></span></div>
<div class="cmd"><b>$</b> ${display.replace(/</g, '&lt;')}</div>
<div id="o"></div><div class="foot" id="f">running…</div>
<script>
const o=document.getElementById('o');let cls=[];
function ansi(s){let html='';const re=/\\x1b\\[([0-9;]*)m/g;let last=0,m;while((m=re.exec(s))){html+=wrap(s.slice(last,m.index));last=re.lastIndex;const codes=m[1]?m[1].split(';').map(Number):[0];for(const c of codes){if(c===0||c===39||c===22)cls=[];else cls.push('c'+c)}}html+=wrap(s.slice(last));return html}
function wrap(t){if(!t)return'';t=t.replace(/[\\u001b]\\[[0-9;]*[A-Za-z]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;');return cls.length?'<span class="'+cls.join(' ')+'">'+t+'</span>':t}
const es=new EventSource('/events');
es.addEventListener('start',e=>{document.getElementById('st').textContent=JSON.parse(e.data)});
es.addEventListener('out',e=>{o.insertAdjacentHTML('beforeend',ansi(JSON.parse(e.data)));o.scrollTop=o.scrollHeight});
es.addEventListener('end',e=>{const d=JSON.parse(e.data);document.getElementById('live').textContent='● FINISHED';document.getElementById('f').innerHTML='process exited with code <span class="'+(d.code===0?'ok':'bad')+'">'+d.code+'</span> after '+d.seconds+' s · output streamed live from the real process';es.close()});
</script></body></html>`;

const server = http.createServer((req, res) => {
  if (req.url === '/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    for (const m of buffered) res.write(m);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(page);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const VIEW = { width: 1920, height: 1080 };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-term-'));
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: VIEW, recordVideo: { dir: tmp, size: VIEW } });
const p = await context.newPage();
const t0 = Date.now();
await p.goto(`http://127.0.0.1:${server.address().port}/`);
await p.waitForTimeout(2500);
const started = new Date();
const startAt = (Date.now() - t0) / 1000;
send('start', `${started.toISOString().replace('T', ' ').slice(0, 19)} UTC`);
const child = spawn(cmd[0], cmd.slice(1), { cwd, env: { ...process.env, FORCE_COLOR: '1', NO_UPDATE_NOTIFIER: '1' }, shell: process.platform === 'win32' && !cmd[0].endsWith('.exe') && cmd[0] !== process.execPath });
child.stdout.on('data', (d) => { raw += d; send('out', String(d)); });
child.stderr.on('data', (d) => { raw += d; send('out', String(d)); });
const code = await new Promise((r) => child.on('close', r));
const seconds = ((Date.now() - started.getTime()) / 1000).toFixed(1);
const endAt = (Date.now() - t0) / 1000;
send('end', { code, seconds });
await p.waitForTimeout(Number(opt('--hold', '4')) * 1000);
await context.close();
await browser.close();
server.close();
const file = fs.readdirSync(tmp).find((f) => f.endsWith('.webm'));
fs.copyFileSync(path.join(tmp, file), path.join(OUT, `term-${name}.webm`));
fs.writeFileSync(path.join(OUT, `term-${name}.log`), raw.replace(/\x1b\[[0-9;]*[A-Za-z]/g, ''));
fs.writeFileSync(path.join(OUT, `term-${name}.json`), JSON.stringify({ name, title, command: display, cwd: path.relative(ROOT, cwd) || '.', startedAt: started.toISOString(), exitCode: code, seconds: Number(seconds), videoProcessStart: +startAt.toFixed(2), videoProcessEnd: +endAt.toFixed(2) }, null, 2));
console.log(`[term] ${name}: exit ${code} in ${seconds}s → term-${name}.webm`);
process.exit(0);
