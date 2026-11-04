import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getGoalAreas, submitQuestionnaire } from '../api';
import type { GoalArea, GoalImportance, GoalStance } from '../api';
import { track } from '../analytics';

const SESSION_KEY = 'civreveal_session_id';
const DRAFT_KEY = 'civreveal_goal_answers';

interface Answer {
  stance: GoalStance;
  importance: GoalImportance;
}

const IMPORTANCE_LABELS: Record<GoalImportance, string> = { 1: 'A little', 2: 'Some', 3: 'A lot' };

function getOrCreateSessionId(): string {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

function loadDraft(): Record<string, Answer> {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Record<string, Answer>) : {};
  } catch {
    return {};
  }
}

function Choice({
  active,
  tone,
  onClick,
  children,
}: {
  active: boolean;
  tone?: 'support' | 'oppose';
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`goal-choice${active ? ' goal-choice-active' : ''}${tone ? ` goal-choice-${tone}` : ''}`}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export default function Questionnaire() {
  const navigate = useNavigate();
  const [areas, setAreas] = useState<GoalArea[]>([]);
  const [chosenAreas, setChosenAreas] = useState<Set<string>>(new Set());
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getGoalAreas()
      .then(({ areas }) => {
        setAreas(areas);
        const draft = loadDraft();
        setAnswers(draft);
        // Reopen the areas the draft touched.
        const touched = new Set<string>();
        for (const area of areas) {
          if (area.goals.some((g) => draft[g.slug])) touched.add(area.slug);
        }
        setChosenAreas(touched);
        setLoading(false);
        track('questionnaire_started');
      })
      .catch(() => {
        setError('Failed to load the goals. Please try again.');
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(answers));
    } catch {
      /* storage unavailable: the draft just isn't kept */
    }
  }, [answers]);

  const answeredCount = Object.keys(answers).length;
  const goalsShown = useMemo(
    () => areas.filter((a) => chosenAreas.has(a.slug)).reduce((n, a) => n + a.goals.length, 0),
    [areas, chosenAreas],
  );

  function toggleArea(slug: string) {
    setChosenAreas((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  function setStance(goal: string, stance: GoalStance | null) {
    setAnswers((prev) => {
      const next = { ...prev };
      if (stance === null) delete next[goal];
      else next[goal] = { stance, importance: prev[goal]?.importance ?? 2 };
      return next;
    });
  }

  function setImportance(goal: string, importance: GoalImportance) {
    setAnswers((prev) => (prev[goal] ? { ...prev, [goal]: { ...prev[goal]!, importance } } : prev));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const sessionId = getOrCreateSessionId();
    const payload = Object.entries(answers).map(([goal, a]) => ({ goal, stance: a.stance, importance: a.importance }));
    try {
      await submitQuestionnaire({ sessionId, answers: payload });
      track('questionnaire_completed', { answeredCount: payload.length });
      navigate('/matches');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed. Please try again.');
      setSubmitting(false);
    }
  }

  function handleReset() {
    setAnswers({});
  }

  if (loading) {
    return (
      <div>
        <h1 className="page-heading">Your policy goals</h1>
        <p className="color-muted">Loading goals…</p>
      </div>
    );
  }

  if (error && areas.length === 0) {
    return (
      <div>
        <h1 className="page-heading">Your policy goals</h1>
        <p style={{ color: 'var(--color-danger)' }}>{error}</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="page-heading">Your policy goals</h1>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
        Each goal is a concrete direction Congress could take. Say whether you support or oppose
        it and how much it matters to you. Goals are independent: supporting one never implies a
        position on another, and you can skip anything.
      </p>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
        Your matches are the members whose recorded votes on bills that advance or hinder these
        goals agree with you most often. <Link to="/methodology">How scoring works →</Link>
      </p>

      <form onSubmit={(e) => { void handleSubmit(e); }}>
        <section className="goal-areas" aria-label="Choose areas">
          <h2 className="goal-step">1. Pick the areas you care about</h2>
          <div className="goal-area-chips">
            {areas.map((area) => {
              const active = chosenAreas.has(area.slug);
              const answeredHere = area.goals.filter((g) => answers[g.slug]).length;
              return (
                <button
                  key={area.slug}
                  type="button"
                  className={`goal-chip${active ? ' goal-chip-active' : ''}`}
                  aria-pressed={active}
                  onClick={() => toggleArea(area.slug)}
                >
                  {area.label}
                  {answeredHere > 0 && <span className="goal-chip-count">{answeredHere}</span>}
                </button>
              );
            })}
          </div>
        </section>

        {chosenAreas.size > 0 && (
          <section aria-label="Answer goals">
            <h2 className="goal-step">
              2. Support, oppose or skip each goal
              <span className="goal-step-count">{answeredCount} of {goalsShown} answered</span>
            </h2>
            {areas.filter((a) => chosenAreas.has(a.slug)).map((area) => (
              <div key={area.slug} className="goal-area">
                <h3 className="goal-area-title">{area.label}</h3>
                {area.goals.map((goal) => {
                  const answer = answers[goal.slug];
                  return (
                    <fieldset key={goal.slug} className="goal-card">
                      <legend className="goal-statement">{goal.statement}</legend>
                      <p className="goal-note">{goal.legislation_note}</p>
                      <div className="goal-choices">
                        <Choice active={answer?.stance === 'support'} tone="support" onClick={() => setStance(goal.slug, answer?.stance === 'support' ? null : 'support')}>
                          Support
                        </Choice>
                        <Choice active={answer?.stance === 'oppose'} tone="oppose" onClick={() => setStance(goal.slug, answer?.stance === 'oppose' ? null : 'oppose')}>
                          Oppose
                        </Choice>
                        <Choice active={!answer} onClick={() => setStance(goal.slug, null)}>
                          Skip
                        </Choice>
                      </div>
                      {answer && (
                        <div className="goal-importance" role="group" aria-label="How much this matters">
                          <span className="goal-importance-label">Matters to me:</span>
                          {([1, 2, 3] as const).map((level) => (
                            <Choice key={level} active={answer.importance === level} onClick={() => setImportance(goal.slug, level)}>
                              {IMPORTANCE_LABELS[level]}
                            </Choice>
                          ))}
                        </div>
                      )}
                    </fieldset>
                  );
                })}
              </div>
            ))}
          </section>
        )}

        {error && <p style={{ color: 'var(--color-danger)', marginBottom: '1rem' }}>{error}</p>}

        <div className="goal-actions">
          <button type="submit" className="btn btn-primary" disabled={submitting || answeredCount === 0}>
            {submitting ? 'Computing matches…' : answeredCount === 0 ? 'Answer a goal to continue' : `See my matches (${answeredCount} answered) →`}
          </button>
          <button type="button" className="btn btn-ghost" onClick={handleReset} disabled={submitting || answeredCount === 0}>
            Clear answers
          </button>
        </div>
      </form>
    </div>
  );
}
