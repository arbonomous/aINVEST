import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Bot, Send, Sparkles, X } from 'lucide-react';
import type { HlAssetCtx } from '../lib/hyperliquidFeed';
import type { InsidersBundle } from '../lib/insidersEngine';
import type { DirectoryEntry } from '../lib/marketCatalog';
import type { NewsArticle } from '../lib/newsFeed';
import {
  askQuantBot,
  type QuantBotResponse,
} from '../lib/quantBotEngine';
import type { MarketQuote } from '../lib/universalFeed';
import type { TickerOptionsSummary } from '../lib/whaleFlowEngine';

interface QuantBotModalProps {
  open: boolean;
  initialQuery?: string;
  activeTicker: string;
  ctxMap: Record<string, HlAssetCtx>;
  quoteMap: Record<string, MarketQuote>;
  directoryMap: Record<string, DirectoryEntry>;
  insidersBundle: InsidersBundle | null;
  optionsMap: Record<string, TickerOptionsSummary>;
  articles: NewsArticle[];
  onSelectTicker: (ticker: string) => void;
  onClose: () => void;
}

interface ChatTurn {
  id: string;
  question: string;
  response: QuantBotResponse;
}

export function QuantBotModal({
  open,
  initialQuery = '',
  activeTicker,
  ctxMap,
  quoteMap,
  directoryMap,
  insidersBundle,
  optionsMap,
  articles,
  onSelectTicker,
  onClose,
}: QuantBotModalProps) {
  const [input, setInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const seededRef = useRef<string>('');

  const runQuery = async (raw: string) => {
    const clean = raw.trim();
    if (!clean || loading) return;
    setLoading(true);
    setInput('');
    try {
      const response = await askQuantBot(clean, {
        activeTicker,
        ctxMap,
        quoteMap,
        directoryMap,
        insidersBundle,
        optionsMap,
        articles,
      });
      setTurns((prev) => [
        ...prev,
        { id: response.id, question: clean, response },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const q = initialQuery.trim();
    if (q && seededRef.current !== q) {
      seededRef.current = q;
      void runQuery(q);
    } else if (!q && turns.length === 0 && seededRef.current === '') {
      seededRef.current = '__welcome__';
      void askQuantBot('', {
        activeTicker,
        ctxMap,
        quoteMap,
        directoryMap,
        insidersBundle,
        optionsMap,
        articles,
      }).then((response) => {
        setTurns([
          {
            id: response.id,
            question: 'What can you analyze?',
            response,
          },
        ]);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialQuery]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns.length]);

  if (!open) return null;

  const quickPrompts = [
    `Analyze ${activeTicker}`,
    'Top bullish setups',
    'Compare NVDA vs AMD',
    'Short squeeze radar',
    'What is Gamma Flip?',
    'Explain VWAP + RSI',
  ];

  return (
    <div
      className="explorer-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="aINVEST QuantBot Market and Technical Analysis AI"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="explorer-modal quantbot-modal">
        <div className="explorer-header">
          <div className="explorer-title-group">
            <Bot size={16} className="text-emerald" />
            <div>
              <h2 className="explorer-title mono">aINVEST QUANTBOT // MARKET &amp; TA AI</h2>
              <p className="explorer-sub mono">
                Trained on live 5-Pillar Confluence • Dealer GEX • Insiders • Technicals
              </p>
            </div>
          </div>
          <button
            type="button"
            className="explorer-close-btn mono"
            onClick={onClose}
            aria-label="Close QuantBot"
          >
            <X size={14} />
            <span>ESC</span>
          </button>
        </div>

        <div className="quantbot-prompts-bar">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              className="explorer-chip mono"
              onClick={() => void runQuery(prompt)}
              disabled={loading}
            >
              <Sparkles size={10} />
              <span>{prompt}</span>
            </button>
          ))}
        </div>

        <div className="quantbot-thread">
          {turns.map((turn) => {
            const r = turn.response;
            return (
              <div key={turn.id} className="quantbot-turn">
                <div className="quantbot-user-q mono">
                  <span className="quantbot-q-prefix">YOU</span>
                  <span>{turn.question}</span>
                </div>

                <div className="quantbot-answer-card">
                  <div className="quantbot-answer-head">
                    <div className="quantbot-answer-title-wrap">
                      <Bot size={13} className="text-emerald" />
                      <h3 className="quantbot-answer-title mono">{r.title}</h3>
                    </div>
                    <span
                      className={`panel-badge mono panel-badge--${
                        r.badgeTone === 'neutral' ? 'amber' : r.badgeTone
                      }`}
                    >
                      {r.badge}
                    </span>
                  </div>

                  <p className="quantbot-summary">{r.summary}</p>

                  {r.metrics.length > 0 && (
                    <div className="quantbot-metrics-grid mono">
                      {r.metrics.map((m) => (
                        <div key={m.label} className="quantbot-metric-box">
                          <span className="quantbot-metric-k">{m.label}</span>
                          <span
                            className={`quantbot-metric-v ${
                              m.tone === 'emerald'
                                ? 'text-emerald'
                                : m.tone === 'crimson'
                                  ? 'text-crimson'
                                  : m.tone === 'amber'
                                    ? 'text-amber'
                                    : ''
                            }`}
                          >
                            {m.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {r.bullets.length > 0 && (
                    <ul className="quantbot-bullets">
                      {r.bullets.map((b, idx) => (
                        <li key={idx}>{b}</li>
                      ))}
                    </ul>
                  )}

                  <div className="quantbot-footer-actions">
                    {r.tickers.length > 0 && (
                      <div className="quantbot-ticker-links">
                        {r.tickers.map((sym) => (
                          <button
                            key={sym}
                            type="button"
                            className="quantbot-warroom-btn mono"
                            onClick={() => {
                              onSelectTicker(sym);
                              onClose();
                            }}
                          >
                            <span>OPEN {sym} WAR ROOM</span>
                            <ArrowRight size={11} />
                          </button>
                        ))}
                      </div>
                    )}

                    {r.followUps.length > 0 && (
                      <div className="quantbot-followups">
                        {r.followUps.map((f) => (
                          <button
                            key={f}
                            type="button"
                            className="quantbot-followup-chip mono"
                            onClick={() => void runQuery(f)}
                            disabled={loading}
                          >
                            {f}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {loading && (
            <div className="quantbot-loading mono">
              Scanning live Confluence, Options GEX &amp; Insider feeds…
            </div>
          )}
          <div ref={threadEndRef} />
        </div>

        <form
          className="quantbot-input-bar"
          onSubmit={(e) => {
            e.preventDefault();
            void runQuery(input);
          }}
        >
          <input
            ref={inputRef}
            id="quantbot-query-input"
            type="text"
            className="quantbot-input mono"
            placeholder={`Ask QuantBot about ${activeTicker}, GEX walls, RSI/VWAP, squeezes, or comparisons…`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button
            type="submit"
            className="quantbot-send-btn mono"
            disabled={loading || !input.trim()}
          >
            <Send size={13} />
            <span>ASK</span>
          </button>
        </form>

        <div className="quantbot-disclaimer mono">
          Rules-based quantitative &amp; technical analysis grounded in live aINVEST feeds — informational only, not investment advice.
        </div>
      </div>
    </div>
  );
}
