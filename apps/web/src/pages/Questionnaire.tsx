import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getQuestions, submitQuestionnaire } from '../api';
import type { PolicyQuestion, Stance } from '../api';
import { track } from '../analytics';

const SESSION_KEY = 'civreveal_session_id';

const STANCE_OPTIONS: Array<{ value: Stance; label: string }> = [
  { value: 'strongly-support', label: 'Strongly Support' },
  { value: 'support',          label: 'Support' },
  { value: 'neutral',          label: 'Skip / No Opinion' },
  { value: 'oppose',           label: 'Oppose' },
  { value: 'strongly-oppose',  label: 'Strongly Oppose' },
];

/** Friendly description for each policy-tag slug. */
const TAG_DESCRIPTIONS: Record<string, string> = {
  healthcare:       'Government healthcare programs, insurance coverage, and public health funding.',
  education:        'Federal education spending, student loans, and public school policy.',
  environment:      'Environmental regulations, climate policy, and clean-energy investment.',
  economy:          'Tax policy, economic stimulus, trade, and government spending.',
  defense:          'Military funding, national-defense programs, and veterans benefits.',
  immigration:      'Border security, immigration pathways, and visa policy.',
  housing:          'Affordable-housing programs, zoning reform, and rent assistance.',
  infrastructure:   'Roads, bridges, broadband, transit, and federal infrastructure investment.',
  'civil-rights':   'Civil rights protections, voting rights, and equality legislation.',
  'foreign-policy': 'International engagement, foreign aid, and diplomatic alliances.',
};

function getOrCreateSessionId(): string {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export default function Questionnaire() {
  const navigate = useNavigate();
  const [questions, setQuestions]   = useState<PolicyQuestion[]>([]);
  const [stances, setStances]       = useState<Record<string, Stance>>({});
  const [loading, setLoading]       = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => {
    getQuestions()
      .then((qs) => {
        setQuestions(qs);
        // Pre-fill all stances to 'neutral' so nothing is blank.
        const defaults: Record<string, Stance> = {};
        for (const q of qs) defaults[q.slug] = 'neutral';
        setStances(defaults);
        setLoading(false);
        track('questionnaire_started');
      })
      .catch(() => {
        setError('Failed to load questions. Please try again.');
        setLoading(false);
      });
  }, []);

  function handleStance(slug: string, value: Stance) {
    setStances((prev) => ({ ...prev, [slug]: value }));
  }

  function handleReset() {
    const defaults: Record<string, Stance> = {};
    for (const q of questions) defaults[q.slug] = 'neutral';
    setStances(defaults);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    // Generate (or reuse) a session ID.
    const sessionId = getOrCreateSessionId();

    const responses = Object.entries(stances).map(([tag, stance]) => ({ tag, stance }));

    try {
      await submitQuestionnaire({ sessionId, responses });
      track('questionnaire_completed', { answeredCount });
      navigate('/matches');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed. Please try again.');
      setSubmitting(false);
    }
  }

  const answeredCount = Object.values(stances).filter((s) => s !== 'neutral').length;

  if (loading) {
    return (
      <div>
        <h1 className="page-heading">Policy Questionnaire</h1>
        <p className="color-muted">Loading questions…</p>
      </div>
    );
  }

  if (error && questions.length === 0) {
    return (
      <div>
        <h1 className="page-heading">Policy Questionnaire</h1>
        <p style={{ color: 'var(--color-danger)' }}>{error}</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="page-heading">Policy Questionnaire</h1>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
        Tell us your views on key policy areas. We'll compare them with how
        politicians have actually voted to show you your closest matches.
      </p>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
        All questions are optional — skip any topic you'd prefer not to answer.
        {answeredCount > 0 && (
          <> <strong>{answeredCount}</strong> of {questions.length} answered.</>
        )}
      </p>

      <form onSubmit={(e) => { void handleSubmit(e); }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '2rem' }}>
          {questions.map((q) => (
            <fieldset key={q.slug} className="card" style={{ border: '1px solid var(--color-border)', padding: '1.25rem', margin: 0 }}>
              <legend style={{ fontWeight: 600, fontSize: '1.0625rem', paddingInline: '0.25rem' }}>
                {q.label}
              </legend>
              {TAG_DESCRIPTIONS[q.slug] && (
                <p style={{ margin: '0.25rem 0 0.875rem', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                  {TAG_DESCRIPTIONS[q.slug]}
                </p>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {STANCE_OPTIONS.map((opt) => {
                  const checked = stances[q.slug] === opt.value;
                  return (
                    <label
                      key={opt.value}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.375rem',
                        padding: '0.375rem 0.75rem',
                        border: `1px solid ${checked ? 'var(--color-primary)' : 'var(--color-border)'}`,
                        borderRadius: 'var(--radius)',
                        background: checked ? 'var(--color-primary-light)' : 'var(--color-surface)',
                        color: checked ? 'var(--color-primary)' : 'var(--color-text)',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        fontWeight: checked ? 600 : 400,
                        transition: 'background 0.1s, border-color 0.1s',
                        userSelect: 'none',
                      }}
                    >
                      <input
                        type="radio"
                        name={q.slug}
                        value={opt.value}
                        checked={checked}
                        onChange={() => handleStance(q.slug, opt.value)}
                        style={{ display: 'none' }}
                      />
                      {opt.label}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>

        {error && (
          <p style={{ color: 'var(--color-danger)', marginBottom: '1rem' }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting || answeredCount === 0}
          >
            {submitting ? 'Computing matches…' : 'See My Matches →'}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleReset}
            disabled={submitting}
          >
            Reset All
          </button>
        </div>

        {answeredCount === 0 && (
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>
            Answer at least one question to see matches.
          </p>
        )}
      </form>
    </div>
  );
}

