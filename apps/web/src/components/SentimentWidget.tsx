import { useState, useEffect, useRef, useCallback } from 'react';
import { getBillSentiments, submitSentiment } from '../api';
import type { SentimentCounts, SentimentValue } from '../api';
import { env } from '../env';

// ─── Session helpers ──────────────────────────────────────────────────────────

const SESSION_KEY = 'civreveal_session_id';

function getOrCreateSessionId(): string {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

/** Per-bill localStorage key that stores the user's submitted sentiment. */
function sentimentStorageKey(billId: string) {
  return `civreveal_sentiment_${billId}`;
}

// ─── Turnstile types ──────────────────────────────────────────────────────────

interface TurnstileAPI {
  render(container: HTMLElement, options: TurnstileOptions): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

interface TurnstileOptions {
  sitekey: string;
  callback: (token: string) => void;
  'expired-callback': () => void;
  'error-callback': () => void;
  theme?: 'light' | 'dark' | 'auto';
}

interface WindowWithTurnstile extends Window {
  turnstile?: TurnstileAPI;
}

// ─── Turnstile hook ───────────────────────────────────────────────────────────

function useTurnstile(siteKey: string | undefined, enabled: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | undefined>(undefined);
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const renderWidget = useCallback(() => {
    const ts = (window as WindowWithTurnstile).turnstile;
    if (!ts || !containerRef.current || !siteKey) return;
    if (widgetIdRef.current !== undefined) return; // already rendered
    widgetIdRef.current = ts.render(containerRef.current, {
      sitekey: siteKey,
      callback: (t: string) => { setToken(t); },
      'expired-callback': () => { setToken(null); },
      'error-callback': () => { setToken(null); },
      theme: 'light',
    });
    setReady(true);
  }, [siteKey]);

  useEffect(() => {
    if (!enabled || !siteKey) return;

    if ((window as WindowWithTurnstile).turnstile) {
      renderWidget();
    } else {
      // Script may still be loading; poll until available.
      const interval = setInterval(() => {
        if ((window as WindowWithTurnstile).turnstile) {
          clearInterval(interval);
          renderWidget();
        }
      }, 200);
      return () => clearInterval(interval);
    }
  }, [enabled, siteKey, renderWidget]);

  // Cleanup widget on unmount.
  useEffect(() => {
    return () => {
      const ts = (window as WindowWithTurnstile).turnstile;
      if (ts && widgetIdRef.current !== undefined) {
        ts.remove(widgetIdRef.current);
        widgetIdRef.current = undefined;
      }
    };
  }, []);

  function resetWidget() {
    const ts = (window as WindowWithTurnstile).turnstile;
    if (ts && widgetIdRef.current !== undefined) {
      ts.reset(widgetIdRef.current);
    }
    setToken(null);
  }

  return { containerRef, token, ready, resetWidget };
}

// ─── SentimentBar component ───────────────────────────────────────────────────

function SentimentBar({ counts }: { counts: SentimentCounts }) {
  if (counts.total === 0) {
    return (
      <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: '0.5rem 0 0' }}>
        No sentiment recorded yet — be the first to react.
      </p>
    );
  }

  const supportPct = Math.round((counts.support / counts.total) * 100);
  const opposePct  = Math.round((counts.oppose / counts.total) * 100);
  const neutralPct = 100 - supportPct - opposePct;

  return (
    <div style={{ marginTop: '0.75rem' }}>
      <div className="sentiment-bar" aria-label="Sentiment breakdown">
        {supportPct > 0 && <div className="sentiment-bar-support" style={{ width: `${supportPct}%` }} />}
        {opposePct  > 0 && <div className="sentiment-bar-oppose"  style={{ width: `${opposePct}%` }} />}
        {neutralPct > 0 && <div className="sentiment-bar-neutral" style={{ width: `${neutralPct}%` }} />}
      </div>
      <div className="sentiment-stats">
        <span className="sentiment-stat">
          <span className="sentiment-dot sentiment-dot-support" />
          Support: {counts.support} ({supportPct}%)
        </span>
        <span className="sentiment-stat">
          <span className="sentiment-dot sentiment-dot-oppose" />
          Oppose: {counts.oppose} ({opposePct}%)
        </span>
        <span className="sentiment-stat">
          <span className="sentiment-dot sentiment-dot-neutral" />
          Neutral: {counts.neutral} ({neutralPct}%)
        </span>
        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>
          {counts.total} {counts.total === 1 ? 'response' : 'responses'}
        </span>
      </div>
    </div>
  );
}

// ─── Main widget ──────────────────────────────────────────────────────────────

interface SentimentWidgetProps {
  billId: string;
}

const SENTIMENT_LABELS: Record<SentimentValue, { label: string; emoji: string }> = {
  support: { label: 'Support', emoji: '👍' },
  oppose:  { label: 'Oppose',  emoji: '👎' },
  neutral: { label: 'Neutral', emoji: '🤔' },
};

type WidgetState = 'idle' | 'pending' | 'submitted' | 'error';

export default function SentimentWidget({ billId }: SentimentWidgetProps) {
  const [counts, setCounts]           = useState<SentimentCounts | null>(null);
  const [widgetState, setWidgetState] = useState<WidgetState>('idle');
  const [errorMsg, setErrorMsg]       = useState<string | null>(null);
  const [selected, setSelected]       = useState<SentimentValue | null>(null);
  const [pending, setPending]         = useState<SentimentValue | null>(null);

  const siteKey   = env.TURNSTILE_SITE_KEY || undefined;
  const needsCaptcha = Boolean(siteKey);

  const { containerRef, token: turnstileToken, ready: captchaReady, resetWidget } =
    useTurnstile(siteKey, widgetState === 'pending');

  // Load saved submission from localStorage.
  useEffect(() => {
    const saved = localStorage.getItem(sentimentStorageKey(billId)) as SentimentValue | null;
    if (saved) {
      setSelected(saved);
      setWidgetState('submitted');
    }
  }, [billId]);

  // Fetch aggregate counts on mount.
  useEffect(() => {
    getBillSentiments(billId)
      .then(setCounts)
      .catch(() => { /* non-critical – counts are optional */ });
  }, [billId]);

  const doSubmit = useCallback(async (sentiment: SentimentValue, token?: string) => {
    setWidgetState('pending');
    const sessionId = getOrCreateSessionId();
    try {
      await submitSentiment({
        billId,
        sessionId,
        sentiment,
        ...(token !== undefined && { turnstileToken: token }),
      });
      // Persist choice locally so the widget stays disabled on refresh.
      localStorage.setItem(sentimentStorageKey(billId), sentiment);
      setSelected(sentiment);
      setWidgetState('submitted');
      // Refresh counts.
      const updated = await getBillSentiments(billId);
      setCounts(updated);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Submission failed. Please try again.');
      setWidgetState('error');
      resetWidget();
    }
  }, [billId, resetWidget]);

  // Auto-submit once we have a Turnstile token (if captcha is required).
  useEffect(() => {
    if (
      widgetState === 'pending' &&
      pending !== null &&
      needsCaptcha &&
      turnstileToken
    ) {
      void doSubmit(pending, turnstileToken);
    }
  }, [doSubmit, needsCaptcha, pending, turnstileToken, widgetState]);

  function handleButtonClick(sentiment: SentimentValue) {
    if (widgetState === 'submitted' || widgetState === 'pending') return;
    setErrorMsg(null);

    if (needsCaptcha) {
      // Show captcha, then auto-submit when token arrives.
      setPending(sentiment);
      setWidgetState('pending');
    } else {
      // No captcha required (dev mode / no site key configured).
      void doSubmit(sentiment);
    }
  }

  function handleCancel() {
    setPending(null);
    setWidgetState('idle');
    resetWidget();
  }

  const isSubmitted = widgetState === 'submitted';
  const isPending   = widgetState === 'pending';

  return (
    <div className="detail-section">
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <h2
          className="detail-section-title"
          style={{ marginBottom: 0, border: 'none', paddingBottom: 0 }}
        >
          Public Sentiment
        </h2>
        <span className="source-label source-label-platform" style={{ fontSize: '0.7rem' }}>
          Platform Users
        </span>
      </div>

      {/* ── Transparency disclaimer ── */}
      <p className="sentiment-disclaimer">
        ⚠️ <strong>Not official polling.</strong> This reflects voluntary reactions from
        registered platform participants only and is <em>not</em> verified constituent data,
        nor a scientific survey. It cannot be used to gauge public opinion at large.
      </p>

      {/* ── Sentiment bar ── */}
      {counts && <SentimentBar counts={counts} />}

      {/* ── Buttons or submitted state ── */}
      <div style={{ marginTop: '1rem' }}>
        {isSubmitted && selected ? (
          <p className="sentiment-submitted-msg">
            ✓ You reacted: <strong>{SENTIMENT_LABELS[selected].emoji} {SENTIMENT_LABELS[selected].label}</strong>
            {' '}— thank you for sharing your view.
          </p>
        ) : (
          <>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: '0 0 0.75rem' }}>
              How do you feel about this bill?
            </p>
            <div className="sentiment-buttons">
              {(Object.entries(SENTIMENT_LABELS) as Array<[SentimentValue, { label: string; emoji: string }]>).map(
                ([value, { label, emoji }]) => (
                  <button
                    key={value}
                    className={`btn sentiment-btn sentiment-btn-${value}${pending === value ? ' sentiment-btn-active' : ''}`}
                    onClick={() => handleButtonClick(value)}
                    disabled={isPending}
                    aria-label={`${label} this bill`}
                  >
                    <span aria-hidden="true">{emoji}</span> {label}
                  </button>
                ),
              )}
            </div>

            {/* ── Turnstile captcha ── */}
            {isPending && (
              <div style={{ marginTop: '1rem' }}>
                {needsCaptcha && (
                  <>
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
                      Please complete the verification below to submit.
                      {!captchaReady && ' Loading…'}
                    </p>
                    <div ref={containerRef} />
                  </>
                )}
                {!needsCaptcha && (
                  <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                    Submitting…
                  </p>
                )}
                <button
                  className="btn btn-ghost"
                  style={{ marginTop: '0.5rem', fontSize: '0.8125rem' }}
                  onClick={handleCancel}
                >
                  Cancel
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Error message ── */}
      {widgetState === 'error' && errorMsg && (
        <p style={{ color: 'var(--color-danger)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
          {errorMsg}
          {' '}
          <button
            className="btn btn-ghost"
            style={{ fontSize: '0.8125rem', padding: '0.25rem 0.5rem' }}
            onClick={() => setWidgetState('idle')}
          >
            Try again
          </button>
        </p>
      )}
    </div>
  );
}
