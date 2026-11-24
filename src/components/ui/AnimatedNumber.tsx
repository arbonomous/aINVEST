import { useEffect, useRef } from 'react';

interface AnimatedNumberProps {
  value: number | null;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  fallback?: string;
  className?: string;
  /** Flash subtle bull/bear tint when live numeric ticks arrive. */
  flashOnTick?: boolean;
}

function formatMetric(
  val: number | null,
  prefix: string,
  suffix: string,
  decimals: number,
  fallback: string,
): string {
  if (val === null || !Number.isFinite(val)) return fallback;
  return `${prefix}${val.toFixed(decimals)}${suffix}`;
}

/**
 * Smoothly interpolated numeric readout with directional live-tick flash.
 * Tweens directly on the DOM node inside requestAnimationFrame for 60fps updates
 * with zero intermediate React re-renders, while honoring prefers-reduced-motion.
 */
export function AnimatedNumber({
  value,
  prefix = '',
  suffix = '',
  decimals = 2,
  fallback = '—',
  className = '',
  flashOnTick = true,
}: AnimatedNumberProps) {
  const spanRef = useRef<HTMLSpanElement | null>(null);
  const prevRef = useRef<number | null>(value);

  useEffect(() => {
    const el = spanRef.current;
    const prev = prevRef.current;
    prevRef.current = value;

    if (!el) return;

    if (value === null || !Number.isFinite(value)) {
      el.textContent = fallback;
      el.classList.remove('animated-num--up', 'animated-num--down');
      return;
    }

    if (prev === null || !Number.isFinite(prev) || prev === value) {
      el.textContent = formatMetric(value, prefix, suffix, decimals, fallback);
      return;
    }

    let flashTimer = 0;
    if (flashOnTick) {
      const cls = value > prev ? 'animated-num--up' : 'animated-num--down';
      el.classList.remove('animated-num--up', 'animated-num--down');
      el.classList.add(cls);
      flashTimer = window.setTimeout(() => {
        el.classList.remove('animated-num--up', 'animated-num--down');
      }, 540);
    }

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reducedMotion) {
      el.textContent = formatMetric(value, prefix, suffix, decimals, fallback);
      return () => {
        if (flashTimer) window.clearTimeout(flashTimer);
      };
    }

    const duration = 260;
    const startTs = performance.now();
    const from = prev;
    const delta = value - from;
    let rafId = 0;

    const step = (now: number) => {
      const progress = Math.min(1, (now - startTs) / duration);
      const eased = 1 - (1 - progress) * (1 - progress) * (1 - progress);
      const current = from + delta * eased;
      el.textContent = formatMetric(current, prefix, suffix, decimals, fallback);
      if (progress < 1) {
        rafId = window.requestAnimationFrame(step);
      } else {
        el.textContent = formatMetric(value, prefix, suffix, decimals, fallback);
      }
    };

    rafId = window.requestAnimationFrame(step);

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      if (flashTimer) window.clearTimeout(flashTimer);
    };
  }, [value, prefix, suffix, decimals, fallback, flashOnTick]);

  return (
    <span
      ref={spanRef}
      className={`animated-num tabular${className ? ` ${className}` : ''}`}
    >
      {formatMetric(value, prefix, suffix, decimals, fallback)}
    </span>
  );
}
