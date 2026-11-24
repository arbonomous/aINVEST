import { ExternalLink } from 'lucide-react';
import type { TickerMeta } from '../data/tickers';
import { BrandLogo } from './ui/BrandLogo';

interface TerminalFooterProps {
  meta: TickerMeta;
}

export function TerminalFooter({ meta }: TerminalFooterProps) {
  const tvUrl = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(meta.tvSymbol)}`;

  return (
    <footer className="terminal-footer">
      <div className="terminal-footer-inner">
        <div className="footer-brand-disclaimer">
          <BrandLogo size="sm" />
          <p className="footer-disclaimer">
            Streams unified live market feeds across 7,290+ US stocks, ETFs, recent &amp;
            upcoming IPOs (NASDAQ, NYSE, AMEX) and 24/7 Hyperliquid HIP-3 markets alongside
            real-time quantitative AI briefs, technical consensus, and open per-ticker trader
            rooms for informational monitoring only — not investment advice.
          </p>
        </div>

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
