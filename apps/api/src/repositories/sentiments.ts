import type { DbPool, SentimentSubmissionRow } from '@civiclens/db';

export interface SentimentCounts {
  support: number;
  oppose: number;
  neutral: number;
  total: number;
}

export interface SubmitSentimentResult {
  submission: SentimentSubmissionRow;
  isDuplicate: boolean;
}

export function createSentimentsRepository(pool: DbPool) {
  /** Return aggregated sentiment counts for a bill. */
  async function getSentimentCounts(billId: string): Promise<SentimentCounts> {
    const result = await pool.query<{ sentiment: string; count: string }>(
      `SELECT sentiment, COUNT(*)::int AS count
       FROM sentiment_submissions
       WHERE bill_id = $1
       GROUP BY sentiment`,
      [billId],
    );

    const counts: SentimentCounts = { support: 0, oppose: 0, neutral: 0, total: 0 };
    for (const row of result.rows) {
      if (row.sentiment === 'support') counts.support = Number(row.count);
      else if (row.sentiment === 'oppose') counts.oppose = Number(row.count);
      else if (row.sentiment === 'neutral') counts.neutral = Number(row.count);
    }
    counts.total = counts.support + counts.oppose + counts.neutral;
    return counts;
  }

  /**
   * Insert a new sentiment submission.
   * Returns the resulting row and `isDuplicate: true` when (bill_id, session_id)
   * already exists (unique constraint violation — the existing row is returned).
   */
  async function submitSentiment(
    billId: string,
    sessionId: string,
    sentiment: 'support' | 'oppose' | 'neutral',
  ): Promise<SubmitSentimentResult> {
    try {
      const result = await pool.query<SentimentSubmissionRow>(
        `INSERT INTO sentiment_submissions (bill_id, session_id, sentiment)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [billId, sessionId, sentiment],
      );
      return { submission: result.rows[0]!, isDuplicate: false };
    } catch (err: unknown) {
      // PostgreSQL unique_violation error code = 23505
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: string }).code === '23505'
      ) {
        const existing = await pool.query<SentimentSubmissionRow>(
          `SELECT * FROM sentiment_submissions WHERE bill_id = $1 AND session_id = $2`,
          [billId, sessionId],
        );
        return { submission: existing.rows[0]!, isDuplicate: true };
      }
      throw err;
    }
  }

  return { getSentimentCounts, submitSentiment };
}

export type SentimentsRepository = ReturnType<typeof createSentimentsRepository>;
