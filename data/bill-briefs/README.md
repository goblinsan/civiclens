# Bill briefs

One file per congress. A brief says, in plain words, what a bill would
likely do if it took effect: each likely outcome with the assumptions it
rests on and what similar efforts produced before; who is likely to benefit
most and who bears the cost; and the official estimates (CBO, JCT, GAO) the
brief leans on.

A brief is analysis, not the official record, and the site labels it that
way. The pull request that merges it is the review; `pnpm db:sync-goals`
loads merged files into `bill_briefs`. Write for a reader on either side:
name concrete groups, state assumptions that could fail, cite the estimate.
