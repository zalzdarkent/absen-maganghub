import type { ReactNode } from 'react';

// Renders a unified diff patch with +/- lines colorized, mirroring the
// original colorizeDiff() which returned pre-built HTML.
export function colorizeDiff(patch: string): ReactNode[] {
  return String(patch || '')
    .split('\n')
    .map((line, i) => {
      if (line.startsWith('+++') || line.startsWith('---')) {
        return (
          <span key={i} style={{ color: '#8b949e' }}>
            {line}
            {'\n'}
          </span>
        );
      }
      if (line.startsWith('@@')) {
        return (
          <span key={i} style={{ color: '#58a6ff' }}>
            {line}
            {'\n'}
          </span>
        );
      }
      if (line.startsWith('+')) {
        return (
          <span key={i} className="line-add">
            {line}
            {'\n'}
          </span>
        );
      }
      if (line.startsWith('-')) {
        return (
          <span key={i} className="line-del">
            {line}
            {'\n'}
          </span>
        );
      }
      return <span key={i}>{line}{'\n'}</span>;
    });
}
