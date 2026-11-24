import { useCallback, useRef, type HTMLAttributes, type PointerEvent, type ReactNode } from 'react';

type SpotlightTone = 'neutral' | 'emerald' | 'crimson' | 'amber';

interface SpotlightSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  tone?: SpotlightTone;
}

/**
 * Mouse-tracked specular sheen surface inspired by React Bits' SpotlightCard.
 * Updates CSS custom properties directly on the DOM node for zero React re-renders.
 */
export function SpotlightSurface({
  children,
  tone = 'neutral',
  className = '',
  onPointerMove,
  onPointerLeave,
  ...rest
}: SpotlightSurfaceProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  const handlePointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const el = ref.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        el.style.setProperty('--spot-x', `${e.clientX - rect.left}px`);
        el.style.setProperty('--spot-y', `${e.clientY - rect.top}px`);
        el.style.setProperty('--spot-opacity', '1');
      }
      onPointerMove?.(e);
    },
    [onPointerMove],
  );

  const handlePointerLeave = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const el = ref.current;
      if (el) {
        el.style.setProperty('--spot-opacity', '0');
      }
      onPointerLeave?.(e);
    },
    [onPointerLeave],
  );

  return (
    <div
      ref={ref}
      className={`spotlight-surface spotlight-surface--${tone}${
        className ? ` ${className}` : ''
      }`}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      {...rest}
    >
      {children}
    </div>
  );
}
