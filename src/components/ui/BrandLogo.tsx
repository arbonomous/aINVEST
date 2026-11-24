import { useCallback, useId, useRef, type PointerEvent } from 'react';

interface BrandLogoProps {
  /** Render the wordmark as <h1> when on the War Room terminal view. */
  asHeading?: boolean;
  /** Compact size for footers or tight toolbars. */
  size?: 'sm' | 'md';
  /** Show only the geometric emblem without wordmark text. */
  iconOnly?: boolean;
}

/**
 * Precision-crafted aINVEST "Apex Signal" geometric monogram + editorial wordmark.
 * Features a beveled squircle emblem with an ascending breakout "A" facet,
 * emerald "I" signal pillar, silk trajectory crossbar (echoing MarketFlowCanvas),
 * soft radial glow, and zero-rerender mouse-tracked specular sheen.
 */
export function BrandLogo({
  asHeading = false,
  size = 'md',
  iconOnly = false,
}: BrandLogoProps) {
  const uid = useId().replace(/:/g, '');
  const badgeRef = useRef<HTMLSpanElement | null>(null);

  const handlePointerMove = useCallback((e: PointerEvent<HTMLSpanElement>) => {
    const el = badgeRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--logo-sx', `${e.clientX - rect.left}px`);
    el.style.setProperty('--logo-sy', `${e.clientY - rect.top}px`);
  }, []);

  const WordmarkTag = asHeading ? 'h1' : 'span';

  return (
    <span
      className={`brand-logo brand-logo--${size}`}
      onPointerMove={handlePointerMove}
    >
      <span ref={badgeRef} className="brand-emblem" aria-hidden="true">
        <svg
          viewBox="0 0 36 36"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="brand-emblem-svg"
        >
          <defs>
            <linearGradient
              id={`ai-shell-${uid}`}
              x1="4"
              y1="0"
              x2="32"
              y2="36"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="var(--logo-bg-top)" />
              <stop offset="100%" stopColor="var(--logo-bg-bot)" />
            </linearGradient>
            <radialGradient
              id={`ai-halo-${uid}`}
              cx="0"
              cy="0"
              r="1"
              gradientUnits="userSpaceOnUse"
              gradientTransform="translate(24.5 11.5) rotate(90) scale(13)"
            >
              <stop offset="0%" stopColor="var(--logo-emerald-hi)" stopOpacity="0.34" />
              <stop offset="55%" stopColor="var(--emerald)" stopOpacity="0.10" />
              <stop offset="100%" stopColor="var(--emerald)" stopOpacity="0" />
            </radialGradient>
            <linearGradient
              id={`ai-emerald-${uid}`}
              x1="21"
              y1="7"
              x2="26"
              y2="28"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="var(--logo-emerald-hi)" />
              <stop offset="100%" stopColor="var(--emerald)" />
            </linearGradient>
            <linearGradient
              id={`ai-arc-${uid}`}
              x1="6"
              y1="24"
              x2="29"
              y2="13"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="var(--emerald)" stopOpacity="0.18" />
              <stop offset="55%" stopColor="var(--logo-emerald-hi)" stopOpacity="0.96" />
              <stop offset="100%" stopColor="var(--logo-emerald-hi)" stopOpacity="0.28" />
            </linearGradient>
          </defs>

          {/* Full-Bleed Precision Machined Base Tile */}
          <rect
            x="0"
            y="0"
            width="36"
            height="36"
            rx="9"
            fill={`url(#ai-shell-${uid})`}
          />

          {/* Silky Radial Ambient Glow behind Signal Pillar */}
          <rect
            x="0"
            y="0"
            width="36"
            height="36"
            rx="9"
            fill={`url(#ai-halo-${uid})`}
          />

          {/* Crisp Inner Hairline Bevel */}
          <rect
            x="0.75"
            y="0.75"
            width="34.5"
            height="34.5"
            rx="8.25"
            stroke="var(--logo-frame)"
            strokeWidth="1"
          />

          {/* Ascending Geometric "A" Facet (Left Leg + Apex) */}
          <path
            d="M8.4 26.6L15.7 10.5C16.2 9.4 17.7 9.4 18.2 10.5L20.4 15.6"
            stroke="var(--logo-ink)"
            strokeWidth="2.65"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Luminous Silk Trajectory Crossbar (Echoing MarketFlowCanvas) */}
          <path
            className="brand-emblem-arc"
            d="M9.6 22.8C14.1 21.8 18.6 19.3 25.4 15.1"
            stroke={`url(#ai-arc-${uid})`}
            strokeWidth="2.1"
            strokeLinecap="round"
          />

          {/* Precision Emerald "I" Signal Pillar */}
          <rect
            x="23.4"
            y="14.2"
            width="3.2"
            height="12.5"
            rx="1.6"
            fill={`url(#ai-emerald-${uid})`}
          />

          {/* AI Apex Signal Node */}
          <circle
            className="brand-emblem-node"
            cx="25"
            cy="9.8"
            r="2.25"
            fill="var(--logo-emerald-hi)"
          />
        </svg>
      </span>

      {!iconOnly && (
        <WordmarkTag className="brand-wordmark">
          <span className="brand-wm-a">a</span>
          <span className="brand-wm-i">I</span>
          <span className="brand-wm-rest">NVEST</span>
        </WordmarkTag>
      )}
    </span>
  );
}
