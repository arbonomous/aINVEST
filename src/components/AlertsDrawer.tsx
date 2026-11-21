import { useMemo, useState } from 'react';
import {
  Bell,
  BellRing,
  CheckCircle2,
  Plus,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { HlAssetCtx } from '../lib/hyperliquidFeed';
import type { DirectoryEntry } from '../lib/marketCatalog';
import {
  getNotificationPermissionState,
  playAlertChime,
  requestBrowserNotificationPermission,
  type PriceAlert,
} from '../lib/priceAlerts';
import type { MarketQuote } from '../lib/universalFeed';

interface AlertsDrawerProps {
  open: boolean;
  defaultTicker: string;
  ctxMap: Record<string, HlAssetCtx>;
  quoteMap: Record<string, MarketQuote>;
  directoryMap: Record<string, DirectoryEntry>;
  alerts: PriceAlert[];
  soundEnabled: boolean;
  onToggleSound: (enabled: boolean) => void;
  onAddAlert: (params: {
    ticker: string;
    targetPrice: number;
    currentPrice?: number | null;
    label?: string;
  }) => void;
  onDeleteAlert: (id: string) => void;
  onClearTriggered: () => void;
  onSelectTicker: (ticker: string) => void;
  onClose: () => void;
}

function fmtPx(n: number): string {
  return n >= 10 ? `$${n.toFixed(2)}` : `$${n.toFixed(3)}`;
}

export function AlertsDrawer({
  open,
  defaultTicker,
  ctxMap,
  quoteMap,
  directoryMap,
  alerts,
  soundEnabled,
  onToggleSound,
  onAddAlert,
  onDeleteAlert,
  onClearTriggered,
  onSelectTicker,
  onClose,
}: AlertsDrawerProps) {
  const [tickerInput, setTickerInput] = useState<string>(defaultTicker);
  const [priceInput, setPriceInput] = useState<string>('');
  const [labelInput, setLabelInput] = useState<string>('');
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | 'unsupported'>(
    () => getNotificationPermissionState(),
  );

  const cleanTicker = tickerInput.trim().toUpperCase().replace(/^\$/, '') || defaultTicker;
  const liveCurrentPx =
    ctxMap[cleanTicker]?.markPx ??
    quoteMap[cleanTicker]?.price ??
    directoryMap[cleanTicker]?.lastSale ??
    null;

  const { activeAlerts, triggeredAlerts } = useMemo(() => {
    const active: PriceAlert[] = [];
    const triggered: PriceAlert[] = [];
    for (const a of alerts) {
      if (a.status === 'ACTIVE') active.push(a);
      else triggered.push(a);
    }
    return { activeAlerts: active, triggeredAlerts: triggered };
  }, [alerts]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number.parseFloat(priceInput);
    if (!cleanTicker || !Number.isFinite(num) || num <= 0) return;
    onAddAlert({
      ticker: cleanTicker,
      targetPrice: num,
      currentPrice: liveCurrentPx,
      label: labelInput.trim() || 'Custom Target',
    });
    setPriceInput('');
    setLabelInput('');
  };

  const handleQuickPct = (pct: number) => {
    if (!liveCurrentPx || liveCurrentPx <= 0) return;
    const target = liveCurrentPx * (1 + pct / 100);
    setPriceInput(target >= 10 ? target.toFixed(2) : target.toFixed(3));
    setLabelInput(pct > 0 ? `+${pct}% Breakout` : `${pct}% Pullback`);
  };

  const handleEnableNotifications = async () => {
    const perm = await requestBrowserNotificationPermission();
    setNotifPerm(perm);
  };

  return (
    <div
      className="explorer-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Live Price Alerts Manager"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="alerts-modal-card">
        <div className="alerts-modal-head">
          <div className="alerts-modal-title-group">
            <BellRing size={15} className="text-amber" />
            <h2 className="panel-title">LIVE PRICE ALERTS</h2>
            <span className="panel-badge panel-badge--amber mono">
              {activeAlerts.length} ACTIVE
            </span>
          </div>

          <div className="alerts-head-controls">
            <button
              type="button"
              className={`alerts-pref-btn mono${soundEnabled ? ' active' : ''}`}
              onClick={() => {
                const next = !soundEnabled;
                onToggleSound(next);
                if (next) playAlertChime();
              }}
              title={soundEnabled ? 'Mute alert chime' : 'Enable alert chime'}
            >
              {soundEnabled ? <Volume2 size={12} /> : <VolumeX size={12} />}
              <span>{soundEnabled ? 'CHIME ON' : 'MUTED'}</span>
            </button>

            {notifPerm !== 'unsupported' && (
              <button
                type="button"
                className={`alerts-pref-btn mono${notifPerm === 'granted' ? ' active' : ''}`}
                onClick={() => void handleEnableNotifications()}
                disabled={notifPerm === 'granted' || notifPerm === 'denied'}
              >
                <Bell size={12} />
                <span>
                  {notifPerm === 'granted'
                    ? 'PUSH ON'
                    : notifPerm === 'denied'
                      ? 'BLOCKED'
                      : 'ENABLE PUSH'}
                </span>
              </button>
            )}

            <button
              type="button"
              className="explorer-close-btn"
              onClick={onClose}
              aria-label="Close alerts manager"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Create Alert Form */}
        <form className="alerts-create-form" onSubmit={handleSubmit}>
          <div className="alerts-form-row">
            <label className="alerts-field">
              <span className="alerts-field-lbl mono">TICKER</span>
              <input
                type="text"
                className="alerts-input mono"
                value={tickerInput}
                onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
                placeholder="NVDA"
                maxLength={12}
              />
            </label>

            <label className="alerts-field">
              <span className="alerts-field-lbl mono">
                TARGET ${liveCurrentPx ? ` (NOW ${fmtPx(liveCurrentPx)})` : ''}
              </span>
              <input
                type="number"
                step="any"
                min="0.001"
                className="alerts-input mono"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                placeholder={liveCurrentPx ? liveCurrentPx.toFixed(2) : '150.00'}
              />
            </label>

            <label className="alerts-field alerts-field--note">
              <span className="alerts-field-lbl mono">NOTE (OPTIONAL)</span>
              <input
                type="text"
                className="alerts-input"
                value={labelInput}
                onChange={(e) => setLabelInput(e.target.value)}
                placeholder="VWAP reclaim / TP1"
                maxLength={40}
              />
            </label>

            <button
              type="submit"
              className="alerts-add-btn mono"
              disabled={!cleanTicker || !priceInput}
            >
              <Plus size={13} />
              <span>ARM ALERT</span>
            </button>
          </div>

          {liveCurrentPx && liveCurrentPx > 0 && (
            <div className="alerts-quick-row mono">
              <span className="alerts-quick-lbl">QUICK TARGET FOR {cleanTicker}:</span>
              {[-3, -1, 1, 3].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  className={`alerts-quick-chip ${pct > 0 ? 'text-emerald' : 'text-crimson'}`}
                  onClick={() => handleQuickPct(pct)}
                >
                  {pct > 0 ? `+${pct}%` : `${pct}%`}
                </button>
              ))}
            </div>
          )}
        </form>

        {/* Active & Triggered Alerts Lists */}
        <div className="alerts-modal-body">
          <div className="alerts-section">
            <div className="alerts-section-head mono">
              <span>ACTIVE WATCH ({activeAlerts.length})</span>
              <span className="text-muted">FREE • LIVE 24/7 + EXCHANGE TICKS</span>
            </div>

            {activeAlerts.length === 0 ? (
              <div className="alerts-empty mono">
                No active alerts yet. Arm one above or click the bell icon on any Daily Bread
                Entry / Target / Stop level.
              </div>
            ) : (
              <div className="alerts-list mono">
                {activeAlerts.map((a) => {
                  const cur =
                    ctxMap[a.ticker]?.markPx ??
                    quoteMap[a.ticker]?.price ??
                    directoryMap[a.ticker]?.lastSale ??
                    null;
                  const distPct =
                    cur && cur > 0 ? ((a.targetPrice - cur) / cur) * 100 : null;
                  return (
                    <div key={a.id} className="alerts-row">
                      <div className="alerts-row-left">
                        <span
                          className={`alerts-cond-pill ${
                            a.condition === 'ABOVE'
                              ? 'alerts-cond-pill--bull'
                              : 'alerts-cond-pill--bear'
                          }`}
                        >
                          {a.condition === 'ABOVE' ? '▲ ABOVE' : '▼ BELOW'}
                        </span>
                        <button
                          type="button"
                          className="bread-sc-ticker"
                          onClick={() => {
                            onSelectTicker(a.ticker);
                            onClose();
                          }}
                        >
                          {a.ticker}
                        </button>
                        <strong className="alerts-target-px">{fmtPx(a.targetPrice)}</strong>
                        <span className="alerts-row-label">{a.label}</span>
                      </div>

                      <div className="alerts-row-right">
                        {distPct !== null && (
                          <span className="alerts-dist text-muted">
                            {distPct >= 0 ? '+' : ''}
                            {distPct.toFixed(2)}% away
                          </span>
                        )}
                        <button
                          type="button"
                          className="bread-sc-del-btn"
                          onClick={() => onDeleteAlert(a.id)}
                          aria-label={`Delete ${a.ticker} alert`}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {triggeredAlerts.length > 0 && (
            <div className="alerts-section">
              <div className="alerts-section-head mono">
                <span>TRIGGERED ({triggeredAlerts.length})</span>
                <button
                  type="button"
                  className="bread-scorecard-clear-btn mono"
                  onClick={onClearTriggered}
                >
                  CLEAR TRIGGERED
                </button>
              </div>

              <div className="alerts-list mono">
                {triggeredAlerts.slice(0, 12).map((a) => (
                  <div key={a.id} className="alerts-row alerts-row--triggered">
                    <div className="alerts-row-left">
                      <CheckCircle2 size={12} className="text-emerald" />
                      <button
                        type="button"
                        className="bread-sc-ticker"
                        onClick={() => {
                          onSelectTicker(a.ticker);
                          onClose();
                        }}
                      >
                        {a.ticker}
                      </button>
                      <strong className="alerts-target-px">{fmtPx(a.targetPrice)}</strong>
                      <span className="alerts-row-label">{a.label}</span>
                    </div>

                    <div className="alerts-row-right">
                      <span className="text-emerald">
                        HIT @ {fmtPx(a.triggeredPrice ?? a.targetPrice)}
                      </span>
                      <button
                        type="button"
                        className="bread-sc-del-btn"
                        onClick={() => onDeleteAlert(a.id)}
                        aria-label={`Remove ${a.ticker} triggered alert`}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
