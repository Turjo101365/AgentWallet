import React from 'react';
import { Composition } from 'remotion';
import { Clip } from './Clip.jsx';
import resolved from './resolved.json';

const FPS = 30;

export function Root() {
  return (
    <>
      {resolved.clips.map((clip) => (
        <Composition
          key={clip.id}
          id={`c${clip.id.replace(/[^a-z0-9]/gi, '')}`}
          component={Clip}
          durationInFrames={clip.segments.reduce((n, s) => n + Math.round((s.to - s.from) * FPS), 0)}
          fps={FPS}
          width={1920}
          height={1080}
          defaultProps={{ clip }}
        />
      ))}
    </>
  );
}
