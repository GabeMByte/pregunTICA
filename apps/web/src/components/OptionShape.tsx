import type { OptionShapeName } from './option-shapes.js';

const PATHS: Record<OptionShapeName, React.ReactElement> = {
  triangle: <polygon points="12,3 22,20 2,20" />,
  diamond: <polygon points="12,2 22,12 12,22 2,12" />,
  circle: <circle cx="12" cy="12" r="10" />,
  square: <rect x="3" y="3" width="18" height="18" rx="2" />,
};

/** Decorative: the option's letter and text carry the meaning for screen readers. */
export function OptionShape({ shape, className }: { shape: OptionShapeName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={className} data-shape={shape} fill="currentColor">
      {PATHS[shape]}
    </svg>
  );
}
