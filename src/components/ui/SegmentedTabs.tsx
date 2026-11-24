import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface SegmentedTabItem<T extends string> {
  id: T;
  label: string;
}

interface SegmentedTabsProps<T extends string> {
  items: ReadonlyArray<SegmentedTabItem<T>>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Smooth sliding-pill segmented tab bar with ResizeObserver layout tracking.
 * Pure CSS + accessible ARIA tablist semantics, zero external motion packages.
 */
export function SegmentedTabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  size = 'md',
  className = '',
}: SegmentedTabsProps<T>) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const btnMapRef = useRef<Map<T, HTMLButtonElement>>(new Map());
  const [indicator, setIndicator] = useState<{
    left: number;
    width: number;
    ready: boolean;
  }>({ left: 0, width: 0, ready: false });

  const measure = useCallback(() => {
    const activeBtn = btnMapRef.current.get(value);
    if (!activeBtn) return;
    setIndicator({
      left: activeBtn.offsetLeft,
      width: activeBtn.offsetWidth,
      ready: true,
    });
  }, [value]);

  useLayoutEffect(() => {
    measure();
  }, [measure, items]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(track);
    return () => ro.disconnect();
  }, [measure]);

  return (
    <div
      ref={trackRef}
      className={`seg-tabs seg-tabs--${size}${className ? ` ${className}` : ''}`}
      role="tablist"
      aria-label={ariaLabel}
    >
      <span
        className={`seg-tabs-indicator${indicator.ready ? ' ready' : ''}`}
        style={{
          transform: `translate3d(${indicator.left}px, 0, 0)`,
          width: `${indicator.width}px`,
        }}
        aria-hidden="true"
      />
      {items.map((item) => {
        const isActive = item.id === value;
        return (
          <button
            key={item.id}
            ref={(node) => {
              if (node) btnMapRef.current.set(item.id, node);
              else btnMapRef.current.delete(item.id);
            }}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`seg-tab-btn mono${isActive ? ' active' : ''}`}
            onClick={() => onChange(item.id)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
