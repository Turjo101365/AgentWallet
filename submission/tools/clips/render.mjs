#!/usr/bin/env node
/**
 * Renders the submission mini-clips from GENUINE footage with Remotion (installed in D:\my-video; nothing new is
 * installed). Sources are COPIED into a temp public dir, so the originals are only read.
 *
 *   node submission/tools/clips/render.mjs [--only 01-dashboard,02-ai-command] [--handles]
 *
 * Output: evidence/submission/mini-clips/<id>.mp4 (1920x1080, 30 fps, H.264), plus clips.resolved.json, the exact
 * source segments, used by CLIP_INDEX.md. --handles also cuts each segment's raw source with 3 s of extra footage on
 * each side (no overlays) into mini-clips/handles/.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const MV = 'D:/my-video';
const req = createRequire(path.join(MV, 'package.json'));
const { bundle } = await import(pathToFileURL(req.resolve('@remotion/bundler')).href);
const { renderMedia, selectComposition } = await import(pathToFileURL(req.resolve('@remotion/renderer')).href);
const { SOURCES, CLIPS } = await import(pathToFileURL(path.join(HERE, 'spec.mjs')).href);
const FF = path.join(MV, 'node_modules/@remotion/compositor-win32-x64-msvc/ffmpeg.exe');
const OUT = path.join(ROOT, 'evidence', 'submission', 'mini-clips');
const FOOT = path.join(ROOT, 'evidence', 'submission', 'footage');
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
fs.mkdirSync(OUT, { recursive: true });

const replayLog = JSON.parse(fs.readFileSync(path.join(FOOT, 'replay-log.json'), 'utf8'));
const termMeta = (name) => JSON.parse(fs.readFileSync(path.join(FOOT, `term-${name}.json`), 'utf8'));
const hms = (ms) => new Date(ms).toISOString().slice(11, 19);

function stampFor(source, from, to) {
  const s = SOURCES[source];
  if (s.t0) return `${hms(s.t0 + from * 1000)}–${hms(s.t0 + to * 1000)} UTC · source t ${from.toFixed(1)}–${to.toFixed(1)} s`;
  if (s.term) { const m = termMeta(s.term); return `${m.command} · run ${m.startedAt.replace('T', ' ').slice(0, 16)} UTC · exit ${m.exitCode}`; }
  if (s.rec) return `captured ${replayLog.createdAt.slice(0, 10)} · source t ${from.toFixed(1)}–${to.toFixed(1)} s`;
  return null;
}

// Resolve marks into rectangles, attach source metadata, validate ranges.
const resolved = { generatedAt: new Date().toISOString(), clips: [] };
for (const clip of CLIPS) {
  const segments = clip.segments.map((g) => {
    const s = SOURCES[g.source];
    if (!s) throw new Error(`${clip.id}: unknown source ${g.source}`);
    const highlights = (g.highlights || []).map((h) => {
      if (!h.mark) return h;
      const m = replayLog.recordings[s.rec].marks.find((x) => x.id === h.mark);
      if (!m?.rect) throw new Error(`${clip.id}: mark ${h.mark} has no rectangle`);
      if (h.from < m.t - 0.05) throw new Error(`${clip.id}: highlight ${h.mark} starts at ${h.from} before its mark (${m.t})`);
      return { ...h, rect: m.rect };
    });
    // Camera keyframes may point at a recorded mark: zoom onto that element's rectangle (plus padding).
    const camera = g.camera?.map((k) => {
      if (!k.mark) return k;
      const m = replayLog.recordings[s.rec].marks.find((x) => x.id === k.mark);
      if (!m?.rect) throw new Error(`${clip.id}: camera mark ${k.mark} has no rectangle`);
      const pad = k.pad ?? 70;
      return { at: k.at, rect: { x: Math.max(0, m.rect.x - pad), y: Math.max(0, m.rect.y - pad), w: Math.min(s.w, m.rect.w + 2 * pad), h: Math.min(s.h, m.rect.h + 2 * pad) } };
    });
    return { ...g, labelTop: g.labelTop ?? (g.source === 'audit' ? true : undefined), camera, src: s.src, image: s.image, w: s.w, h: s.h, kind: g.kind || s.kind, sourceFile: s.file, stamp: g.stamp ?? stampFor(g.source, g.from, g.to), highlights };
  });
  resolved.clips.push({ ...clip, segments, seconds: +segments.reduce((n, g) => n + (g.to - g.from), 0).toFixed(2) });
}
fs.writeFileSync(path.join(HERE, 'src', 'resolved.json'), JSON.stringify(resolved, null, 2));
fs.writeFileSync(path.join(OUT, 'clips.resolved.json'), JSON.stringify(resolved, null, 2));

// Public dir with copies of the sources actually used.
const pub = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-clips-public-'));
const used = new Set(resolved.clips.filter((c) => !only || only.includes(c.id)).flatMap((c) => c.segments.map((g) => g.source)));
for (const k of used) {
  const s = SOURCES[k];
  const from = s.image ? path.join(HERE, 'assets', s.image) : path.join(ROOT, s.file);
  fs.copyFileSync(from, path.join(pub, s.src || s.image));
}

const serveUrl = await bundle({
  entryPoint: path.join(HERE, 'src', 'index.jsx'),
  publicDir: pub,
  webpackOverride: (c) => ({ ...c, resolve: { ...c.resolve, modules: [path.join(MV, 'node_modules'), 'node_modules'] }, resolveLoader: { ...(c.resolveLoader || {}), modules: [path.join(MV, 'node_modules'), 'node_modules'] } }),
});

for (const clip of resolved.clips) {
  if (args.includes('--handles-only')) break;
  if (only && !only.includes(clip.id)) continue;
  const id = `c${clip.id.replace(/[^a-z0-9]/gi, '')}`;
  const composition = await selectComposition({ serveUrl, id, inputProps: { clip } });
  const out = path.join(OUT, `${clip.id}.mp4`);
  const t = Date.now();
  await renderMedia({
    composition, serveUrl, codec: 'h264', crf: 18, x264Preset: 'medium', pixelFormat: 'yuv420p', imageFormat: 'jpeg', jpegQuality: 92,
    concurrency: 1, outputLocation: out, inputProps: { clip }, muted: true, enforceAudioTrack: false, timeoutInMilliseconds: 120000,
    onProgress: ({ progress }) => { if (Math.round(progress * 100) % 25 === 0) process.stdout.write(`\r[clips] ${clip.id} ${Math.round(progress * 100)}%   `); },
  });
  console.log(`\n[clips] ${clip.id}.mp4 ${clip.seconds}s rendered in ${((Date.now() - t) / 1000).toFixed(0)}s`);
}

if (args.includes('--handles') || args.includes('--handles-only')) {
  const H = path.join(OUT, 'handles');
  fs.mkdirSync(H, { recursive: true });
  for (const clip of resolved.clips) {
    if (only && !only.includes(clip.id)) continue;
    clip.segments.forEach((g, i) => {
      if (g.image) return;
      const a = Math.max(0, g.from - 3);
      const b = g.to + 3;
      const out = path.join(H, `${clip.id}__${String(i + 1).padStart(2, '0')}-${path.basename(g.src, '.webm')}-${a.toFixed(1)}-${b.toFixed(1)}.mp4`);
      const r = spawnSync(FF, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', a.toFixed(2), '-to', b.toFixed(2), '-i', path.join(ROOT, g.sourceFile), '-an', '-vf', `scale=${g.w >= 1920 ? '1920:1080' : `${Math.round(1080 * g.w / g.h / 2) * 2}:1080`}:flags=lanczos,format=yuv420p`, '-r', '30', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', out]);
      if (r.status !== 0) throw new Error(r.stderr.toString().slice(-300));
    });
    console.log(`[handles] ${clip.id}`);
  }
}
fs.rmSync(pub, { recursive: true, force: true });
console.log('[clips] done');
