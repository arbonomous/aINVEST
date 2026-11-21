export type AlertCondition = 'ABOVE' | 'BELOW';
export type AlertStatus = 'ACTIVE' | 'TRIGGERED';

export interface PriceAlert {
  id: string;
  ticker: string;
  targetPrice: number;
  condition: AlertCondition;
  label: string;
  createdAt: number;
  status: AlertStatus;
  triggeredAt?: number;
  triggeredPrice?: number;
}

const ALERTS_STORAGE_KEY = 'ainvest_price_alerts_v1';
const SOUND_STORAGE_KEY = 'ainvest_alert_sound_v1';
const MAX_ALERTS = 50;

export function loadPriceAlerts(): PriceAlert[] {
  try {
    const raw = window.localStorage.getItem(ALERTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (a): a is PriceAlert =>
          Boolean(a) &&
          typeof a.id === 'string' &&
          typeof a.ticker === 'string' &&
          typeof a.targetPrice === 'number' &&
          a.targetPrice > 0 &&
          (a.condition === 'ABOVE' || a.condition === 'BELOW'),
      )
      .slice(0, MAX_ALERTS);
  } catch {
    return [];
  }
}

export function savePriceAlerts(alerts: PriceAlert[]): void {
  try {
    window.localStorage.setItem(
      ALERTS_STORAGE_KEY,
      JSON.stringify(alerts.slice(0, MAX_ALERTS)),
    );
  } catch {
    // Ignore storage restrictions
  }
}

export function loadAlertSoundEnabled(): boolean {
  try {
    const raw = window.localStorage.getItem(SOUND_STORAGE_KEY);
    return raw !== 'false';
  } catch {
    return true;
  }
}

export function saveAlertSoundEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(SOUND_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Ignore
  }
}

export function createPriceAlert(params: {
  ticker: string;
  targetPrice: number;
  currentPrice?: number | null;
  condition?: AlertCondition;
  label?: string;
}): PriceAlert | null {
  const ticker = params.ticker.trim().toUpperCase().replace(/^\$/, '');
  const targetPrice = Number(params.targetPrice);
  if (!ticker || !Number.isFinite(targetPrice) || targetPrice <= 0) return null;

  const condition: AlertCondition =
    params.condition ??
    (params.currentPrice && params.currentPrice > 0
      ? targetPrice >= params.currentPrice
        ? 'ABOVE'
        : 'BELOW'
      : 'ABOVE');

  return {
    id: `${ticker}-${condition}-${targetPrice.toFixed(3)}-${Date.now()}`,
    ticker,
    targetPrice: Number(targetPrice.toFixed(targetPrice >= 10 ? 2 : 3)),
    condition,
    label: (params.label ?? 'Price Alert').trim() || 'Price Alert',
    createdAt: Date.now(),
    status: 'ACTIVE',
  };
}

/**
 * Evaluates all ACTIVE price alerts against live ticker prices.
 * Returns `{ alerts, newlyTriggered }` so callers only update state when an alert triggers.
 */
export function evaluateAlertsWithPrices(
  alerts: PriceAlert[],
  priceMap: Record<string, number>,
): { alerts: PriceAlert[]; newlyTriggered: PriceAlert[] } {
  const newlyTriggered: PriceAlert[] = [];
  const now = Date.now();

  const next = alerts.map((a) => {
    if (a.status !== 'ACTIVE') return a;
    const px = priceMap[a.ticker];
    if (!Number.isFinite(px) || px <= 0) return a;

    const hit =
      (a.condition === 'ABOVE' && px >= a.targetPrice) ||
      (a.condition === 'BELOW' && px <= a.targetPrice);

    if (!hit) return a;

    const updated: PriceAlert = {
      ...a,
      status: 'TRIGGERED',
      triggeredAt: now,
      triggeredPrice: px,
    };
    newlyTriggered.push(updated);
    return updated;
  });

  return {
    alerts: newlyTriggered.length > 0 ? next : alerts,
    newlyTriggered,
  };
}

/**
 * Plays a gentle two-tone institutional chime via the Web Audio API (zero audio assets).
 */
export function playAlertChime(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const playTone = (freq: number, startOffset: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + startOffset);
      gain.gain.setValueAtTime(0.0001, now + startOffset);
      gain.gain.exponentialRampToValueAtTime(0.11, now + startOffset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + startOffset);
      osc.stop(now + startOffset + duration + 0.02);
    };

    playTone(659.25, 0, 0.22); // E5
    playTone(880.0, 0.14, 0.32); // A5

    window.setTimeout(() => {
      void ctx.close().catch(() => {});
    }, 800);
  } catch {
    // Ignore autoplay / unsupported AudioContext restrictions
  }
}

export function getNotificationPermissionState(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'unsupported';
  }
  return Notification.permission;
}

export async function requestBrowserNotificationPermission(): Promise<
  NotificationPermission | 'unsupported'
> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'unsupported';
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function sendBrowserAlertNotification(alert: PriceAlert): void {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;

  const pxStr =
    alert.triggeredPrice !== undefined
      ? `$${alert.triggeredPrice.toFixed(2)}`
      : `$${alert.targetPrice.toFixed(2)}`;
  const verb = alert.condition === 'ABOVE' ? 'crossed above' : 'dropped below';

  try {
    new Notification(`aINVEST Alert: ${alert.ticker} ${pxStr}`, {
      body: `${alert.ticker} ${verb} $${alert.targetPrice.toFixed(2)} (${alert.label})`,
      tag: alert.id,
    });
  } catch {
    // Ignore notification restrictions on mobile WebViews
  }
}
