-- Migration: 010_house_vote_question_refetch
-- Description: The ingest job stored the House vote *type* ("Yea-and-Nay",
--              "Recorded Vote") as the question, because the list endpoint
--              has no question and the job fell back to voteType. The members
--              endpoint carries voteQuestion; the job now reads it from there.
--              Mark every House roll-call whose stored question is not a real
--              question for one re-fetch so the next ingest backfills it.

UPDATE votes
SET question = NULL, source_updated_at = NULL
WHERE chamber = 'house'
  AND (question IS NULL OR question NOT ILIKE 'On %');
