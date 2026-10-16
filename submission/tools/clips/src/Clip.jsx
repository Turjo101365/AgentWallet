import React from 'react';
import { AbsoluteFill, OffthreadVideo, Img, Sequence, staticFile, useCurrentFrame, useVideoConfig, interpolate, Easing } from 'remotion';
import { loadFont as loadFustat } from '@remotion/google-fonts/Fustat';
import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono';
import { loadFont as loadGlyphic } from '@remotion/google-fonts/FacultyGlyphic';

const { fontFamily: SANS } = loadFustat('normal', { weights: ['500', '700', '800'], subsets: ['latin'] });
const { fontFamily: MONO } = loadMono('normal', { weights: ['500', '700'], subsets: ['latin'] });
const { fontFamily: DISPLAY } = loadGlyphic('normal', { weights: ['400'], subsets: ['latin'] });

const W = 1920;
const H = 1080;
const INK = '#121411';
const MINT = '#9fdcb8';

// Evidence classes. Colours follow the console: sky = public chain, lilac = post-run capture of public data,
// butter = local testing, neutral = explanatory graphic.
export const KINDS = {
  public: { bg: '#d8e7f4', fg: '#153f66', text: 'PUBLIC · ETHEREUM SEPOLIA · ORIGINAL RUN RECORDING' },
  verify: { bg: '#e4def5', fg: '#3f2d78', text: 'PUBLIC CHAIN · POST-RUN EXPLORER VERIFICATION' },
  replay: { bg: '#e4def5', fg: '#3f2d78', text: 'PUBLIC RUN DATA · POST-RUN READ-ONLY REPLAY' },
  liveverify: { bg: '#e4def5', fg: '#3f2d78', text: 'PUBLIC DATA · LIVE VERIFICATION COMMAND' },
  publicbridge: { bg: '#d8e7f4', fg: '#153f66', text: 'PUBLIC · ETHEREUM SEPOLIA · ORIGINAL RUN · OWNER SIGNED BY TEST-ONLY WALLET BRIDGE (NOT METAMASK)' },
  local: { bg: '#f5ebc0', fg: '#5e4a06', text: 'LOCAL TESTING · HARDHAT 31337' },
  localmm: { bg: '#f5ebc0', fg: '#5e4a06', text: 'LOCAL HARDHAT TESTING · REAL METAMASK EXTENSION' },
  diagram: { bg: '#eeeee9', fg: '#3a3a35', text: 'ARCHITECTURE DIAGRAM · EXPLANATORY GRAPHIC' },
};

const ease = Easing.bezier(0.45, 0, 0.2, 1);
const lerp = (a, b, k) => a + (b - a) * k;

/** Camera: the visible source rectangle at source time t, eased between keyframes over 0.9 s. */
function cameraAt(seg, t) {
  const full = { x: 0, y: 0, w: seg.w, h: seg.h };
  const keys = seg.camera?.length ? seg.camera : [{ at: seg.from, rect: full }];
  let cur = keys[0].rect;
  let prev = keys[0].rect;
  let k = 1;
  for (let i = 0; i < keys.length; i++) {
    if (t >= keys[i].at) {
      prev = i > 0 ? keys[i - 1].rect : keys[i].rect;
      cur = keys[i].rect;
      k = Math.min(1, (t - keys[i].at) / 0.9);
    }
  }
  const e = ease(k);
  return { x: lerp(prev.x, cur.x, e), y: lerp(prev.y, cur.y, e), w: lerp(prev.w, cur.w, e), h: lerp(prev.h, cur.h, e) };
}

function transformFor(seg, r) {
  const fit = Math.min(W / seg.w, H / seg.h);
  const s = Math.max(fit, Math.min(W / r.w, H / r.h));
  const vw = W / s;
  const vh = H / s;
  let cx = r.x + r.w / 2;
  let cy = r.y + r.h / 2;
  cx = vw >= seg.w ? seg.w / 2 : Math.min(Math.max(cx, vw / 2), seg.w - vw / 2);
  cy = vh >= seg.h ? seg.h / 2 : Math.min(Math.max(cy, vh / 2), seg.h - vh / 2);
  return { s, left: W / 2 - cx * s, top: H / 2 - cy * s };
}

// Tag above the box; if that would hit the caption band at the top (or fall off the bottom), tuck it inside the
// box's top-right corner instead, away from the left-aligned caption.
function tagPosition(x, y, w, h) {
  const above = y - 52;
  if (above >= 150) return { left: Math.max(24, Math.min(x, W - 900)), top: above };
  const inside = Math.max(150, y + 14);
  return { right: Math.max(24, W - (x + w) + 14), top: Math.min(inside, H - 120) };
}

function Highlight({ hl, tf, t }) {
  const { fps } = useVideoConfig();
  const inK = interpolate(t, [hl.from, hl.from + 8 / fps], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const outK = interpolate(t, [hl.to - 6 / fps, hl.to], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const o = Math.min(inK, outK);
  if (o <= 0 || !hl.rect) return null;
  const pad = 8;
  const x = hl.rect.x * tf.s + tf.left - pad;
  const y = hl.rect.y * tf.s + tf.top - pad;
  const w = hl.rect.w * tf.s + pad * 2;
  const h = hl.rect.h * tf.s + pad * 2;
  const grow = 1 + 0.035 * (1 - ease(inK));
  return (
    <>
      <div
        style={{
          position: 'absolute', left: x, top: y, width: w, height: h, borderRadius: 18, opacity: o,
          border: `3px solid ${MINT}`, transform: `scale(${grow})`, transformOrigin: 'center',
          boxShadow: `0 0 0 6px rgba(159,220,184,0.22)${hl.spot === false ? '' : ', 0 0 0 4000px rgba(18,20,17,0.38)'}`,
        }}
      />
      {hl.text && (
        <div
          style={{
            position: 'absolute', ...tagPosition(x, y, w, h), opacity: o,
            background: INK, color: MINT, fontFamily: MONO, fontWeight: 700, fontSize: 22, padding: '8px 16px', borderRadius: 999,
            boxShadow: '0 8px 24px rgba(0,0,0,.35)', whiteSpace: 'nowrap',
          }}
        >
          {hl.text}
        </div>
      )}
    </>
  );
}

function Label({ seg, top }) {
  const kind = KINDS[seg.kind];
  return (
    <div style={{ position: 'absolute', left: 28, ...(top ? { top: 26 } : { bottom: 26 }), display: 'flex', flexDirection: top ? 'column-reverse' : 'column', gap: 8, alignItems: 'flex-start', maxWidth: 1500 }}>
      {seg.caption && (
        <div style={{ background: 'rgba(18,20,17,0.88)', color: '#fff', fontFamily: SANS, fontWeight: 700, fontSize: 30, padding: '10px 20px', borderRadius: 16, lineHeight: 1.25 }}>
          {seg.caption}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ background: kind.bg, color: kind.fg, fontFamily: MONO, fontWeight: 700, fontSize: 17, letterSpacing: '0.08em', padding: '7px 14px', borderRadius: 999 }}>{kind.text}</span>
        {seg.stamp && <span style={{ background: 'rgba(18,20,17,0.85)', color: 'rgba(255,255,255,0.85)', fontFamily: MONO, fontSize: 16, padding: '7px 12px', borderRadius: 999 }}>{seg.stamp}</span>}
      </div>
    </div>
  );
}

// Move the caption to the top when any highlight of this segment reaches the bottom 190 px of the frame.
function labelOnTop(seg, tf) {
  return (seg.highlights || []).some((h) => h.rect && (h.rect.y + h.rect.h) * tf.s + tf.top > H - 190);
}

function Segment({ seg }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = seg.from + frame / fps; // source time
  const tf = transformFor(seg, cameraAt(seg, t));
  return (
    <AbsoluteFill style={{ background: INK, overflow: 'hidden' }}>
      {seg.image ? (
        <Img src={staticFile(seg.image)} style={{ position: 'absolute', left: tf.left, top: tf.top, width: seg.w * tf.s, height: seg.h * tf.s }} />
      ) : (
        <OffthreadVideo
          src={staticFile(seg.src)}
          trimBefore={Math.round(seg.from * fps)}
          muted
          style={{ position: 'absolute', left: tf.left, top: tf.top, width: seg.w * tf.s, height: seg.h * tf.s }}
        />
      )}
      {(seg.highlights || []).map((hl, i) => <Highlight key={i} hl={hl} tf={tf} t={t} />)}
      {seg.label !== false && <Label seg={seg} top={seg.labelTop ?? labelOnTop(seg, tf)} />}
    </AbsoluteFill>
  );
}

export function Clip({ clip }) {
  const { fps } = useVideoConfig();
  let at = 0;
  return (
    <AbsoluteFill style={{ background: INK, fontFamily: SANS }}>
      {clip.segments.map((seg, i) => {
        const frames = Math.round((seg.to - seg.from) * fps);
        const el = (
          <Sequence key={i} from={at} durationInFrames={frames} layout="none">
            <Segment seg={seg} />
          </Sequence>
        );
        at += frames;
        return el;
      })}
    </AbsoluteFill>
  );
}

export { DISPLAY };
