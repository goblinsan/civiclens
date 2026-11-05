# Bill → goal effect codings

One file per congress (`119.json`). Each entry says that one bill *advances*
or *hinders* one goal from `data/policy-goals.json`, how strongly (1 partial,
2 clear, 3 central purpose), why, and the passage of the official CRS summary
the judgement rests on.

The pull request that adds or changes an entry is the review: nothing counts
toward a score until it is merged, and `git log` on this directory is the
audit trail. The ingest workflow syncs merged files into `bill_goal_effects`
with `pnpm db:sync-goals`; entries removed from a file are removed from the
database.

Only bills with a recorded roll-call vote are worth coding; the
**Coding candidates** workflow exports them with their summaries.
