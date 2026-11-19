import { memo, useEffect, useRef } from 'react';

interface TradingViewEmbedProps {
  scriptSrc: string;
  configJson: string;
  fillHeight?: boolean;
  ariaLabel: string;
}

function TradingViewEmbedComponent({
  scriptSrc,
  configJson,
  fillHeight = false,
  ariaLabel,
}: TradingViewEmbedProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.replaceChildren();

    const widgetSlot = document.createElement('div');
    widgetSlot.className = 'tradingview-widget-container__widget';
    if (fillHeight) {
      widgetSlot.style.height = '100%';
      widgetSlot.style.width = '100%';
    }
    container.appendChild(widgetSlot);

    const script = document.createElement('script');
    script.src = scriptSrc;
    script.type = 'text/javascript';
    script.async = true;
    script.textContent = configJson;
    container.appendChild(script);

    return () => {
      container.replaceChildren();
    };
  }, [scriptSrc, configJson, fillHeight]);

  return (
    <div
      ref={containerRef}
      className="tradingview-widget-container"
      aria-label={ariaLabel}
      style={fillHeight ? { height: '100%', width: '100%' } : { width: '100%' }}
    />
  );
}

export const TradingViewEmbed = memo(TradingViewEmbedComponent);
