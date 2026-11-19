import { ExternalLink } from 'lucide-react';
import type { TickerMeta } from '../data/tickers';

interface TerminalFooterProps {
  meta: TickerMeta;
}

export function TerminalFooter({ meta }: TerminalFooterProps) {
  const tvUrl = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(meta.tvSymbol)}`;

  return (
    <footer className="terminal-footer">
      <div className="terminal-footer-inner">
        <p className="footer-disclaimer">
          <strong>aINVEST</strong> streams 0-delay 24/7 Hyperliquid HIP-3 equity &amp;
          macro perp feeds alongside real-time quantitative AI briefs, technical
          oscillator consensus, and open trader rooms for informational monitoring only —
          not investment advice.
        </p>

        <a
          href={tvUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="footer-tv-link"
        >
          <span>Open {meta.tvSymbol} on TradingView</span>
          <ExternalLink size={12} />
        </a>
      </div>
    </footer>
  );
}
