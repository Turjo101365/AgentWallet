#!/usr/bin/env node
/**
 * Screen-records an architecture SVG displayed in a browser (1920x1080), for the architecture mini-clip.
 *   node submission/tools/record-diagram.mjs [svg] [seconds] [out-name]
 * The SVG is the editable source in submission/01-technical-documentation/. Nothing is animated on the page;
 * pans and highlights are added in the clip renderer and listed in CLIP_INDEX.md.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { chromium } = createRequire(path.join(ROOT, 'frontend', 'package.json'))('@playwright/test');
const [svgArg, secArg, nameArg] = process.argv.slice(2);
const svg = path.resolve(ROOT, svgArg || 'submission/01-technical-documentation/architecture-v2.svg');
const seconds = Number(secArg || 32);
const name = nameArg || 'architecture-v2-screen';
const OUT = path.join(ROOT, 'evidence', 'submission', 'footage');
const VIEW = { width: 1920, height: 1080 };
const tmp = fs.mkdtempSync(path.join(process.env.AW_TMP || os.tmpdir(), 'aw-diagram-'));
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: VIEW, recordVideo: { dir: tmp, size: VIEW } });
const page = await context.newPage();
await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Faculty+Glyphic&family=Fustat:wght@400;700;800&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet"><style>html,body{margin:0;background:#ecece6;overflow:hidden}</style></head><body>${fs.readFileSync(svg, 'utf8')}</body></html>`);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(1500);
const t0 = Date.now();
await page.waitForTimeout(seconds * 1000);
await context.close();
await browser.close();
const file = fs.readdirSync(tmp).find((f) => f.endsWith('.webm'));
fs.copyFileSync(path.join(tmp, file), path.join(OUT, `${name}.webm`));
fs.rmSync(tmp, { recursive: true, force: true });
fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify({ source: path.relative(ROOT, svg).split(path.sep).join('/'), recordedAt: new Date(t0).toISOString(), note: 'Static diagram displayed in Chromium; fonts loaded ~1.5 s before the steady segment starts.' }, null, 2));
console.log(`[diagram] ${name}.webm`);
