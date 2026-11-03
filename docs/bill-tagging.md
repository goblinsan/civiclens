# Bill Tagging

How CivReveal decides which policy tags a bill carries, and therefore which
questionnaire topics a vote on that bill counts toward.

The design goal is that **no human at CivReveal decides what a bill is about**.
Every tag is derived mechanically from the official classification that the
Congressional Research Service (CRS) publishes for the bill on Congress.gov,
using the public mapping tables on this page. Anyone can check any tag on any
bill against these tables.

The implementation is `jobs/ingest-congress/src/tagging.ts`; the tables there
are the source of truth and this page mirrors them. A test guards that every
mapped policy area is in the controlled CRS list and that every tag is
reachable.

---

## 1. Source data

Congress.gov assigns two kinds of classification to every bill and resolution
([API docs](https://github.com/LibraryOfCongress/api.congress.gov/blob/main/Documentation/BillEndpoint.md)):

| Field | Cardinality | Vocabulary | Where we get it |
| --- | --- | --- | --- |
| **Policy area** | exactly one per bill | controlled list of 32 terms ([field values](https://www.congress.gov/help/field-values/policy-area)) | `bill.policyArea.name` on the bill detail; falls back to the `/subjects` endpoint |
| **Legislative subjects** | zero or more | larger controlled vocabulary | `subjects.legislativeSubjects[].name` on `/bill/{congress}/{type}/{number}/subjects` |

Both are stored verbatim on the `bills` row (`policy_area`, `subjects`) and
shown on the bill page under **Official classification**.

Note: Congress.gov assigns classification some time after introduction. A newly
introduced bill may have no policy area yet; it is re-checked on every ingest
run and tagged once the classification appears.

---

## 2. Derivation rules

1. Look up the bill's **policy area** in the policy-area table (§3). Add each
   listed tag, recording `source = 'policy-area'` and the official term.
2. For each **legislative subject**, look it up in the subject table (§4). Add
   each listed tag, recording `source = 'subject'` and the official term.
3. A tag is added at most once. If the policy area and a subject both produce
   it, the policy area is recorded as the source.
4. Matching is case- and whitespace-insensitive; the official term is stored
   exactly as published.
5. Any term not in the tables produces **no tag**. A bill with no tags is
   stored normally but does not count toward any alignment score.
6. Tags are recomputed from scratch on every ingest run, so a change to these
   tables (or to the bill's official classification) takes effect on the next
   run. Tags with `source = 'manual'` are never removed or overwritten by the
   job.

Policy area terms outside the known CRS list are reported in the run log and
the `run_complete` ingestion event (`unknownPolicyAreas`) so a list change is
noticed rather than silently dropped.

---

## 3. Policy area → tags

| CRS policy area | Tags |
| --- | --- |
| Health | healthcare |
| Education | education |
| Environmental Protection | environment |
| Energy | environment |
| Public Lands and Natural Resources | environment |
| Water Resources Development | environment, infrastructure |
| Economics and Public Finance | economy |
| Taxation | economy |
| Commerce | economy |
| Finance and Financial Sector | economy |
| Labor and Employment | economy |
| Foreign Trade and International Finance | economy, foreign-policy |
| Armed Forces and National Security | defense |
| Immigration | immigration |
| Housing and Community Development | housing |
| Transportation and Public Works | infrastructure |
| Civil Rights and Liberties, Minority Issues | civil-rights |
| International Affairs | foreign-policy |

**Deliberately not mapped** (too broad, or no matching questionnaire topic).
Bills in these areas can still be tagged through a subject term:

Agriculture and Food · Animals · Arts, Culture, Religion · Congress · Crime and
Law Enforcement · Emergency Management · Families · Government Operations and
Politics · Law · Native Americans · Private Legislation · Science, Technology,
Communications · Social Welfare · Sports and Recreation

---

## 4. Legislative subject → tags

Only subject terms that map unambiguously to a questionnaire topic are listed.

### healthcare

Health care coverage and access · Health care costs and insurance · Health
programs administration and funding · Medicare · Medicaid · Prescription drugs ·
Mental health · Hospital care · Health personnel · Child health · Women's health
· Veterans' medical care *(also defense)*

### education

Elementary and secondary education · Higher education · Student aid and college
costs · Education programs funding · Teaching, teachers, curricula · Vocational
and technical education · Special education · Preschool education · Educational
facilities

### environment

Climate change and greenhouse gases · Air quality · Water quality ·
Environmental assessment, monitoring, research · Environmental regulatory
procedures · Hazardous wastes and toxic substances · Wildlife conservation and
habitat protection · Endangered and threatened species · Alternative and
renewable resources · Energy efficiency and conservation · Solid waste and
recycling

### economy

Income tax rates · Income tax deductions · Income tax credits · Budget deficits
and national debt · Small business · Wages and earnings · Employment and
training programs · Unemployment · Inflation and prices · Economic development ·
Business investment and capital · Banking and financial institutions regulation
· Trade agreements and negotiations *(also foreign-policy)*

### defense

Military operations and strategy · Military procurement, research, weapons
development · Defense spending · Military personnel and dependents · Military
readiness · Military education and training · Military facilities and property
· Nuclear weapons · Intelligence activities, surveillance, classified
information · Terrorism · Veterans' education, employment, rehabilitation ·
Veterans' pensions and compensation · Military assistance, sales, and
agreements *(also foreign-policy)* · Veterans' medical care *(also healthcare)*

### immigration

Border security and unlawful immigration · Immigration status and procedures ·
Citizenship and naturalization · Visas and passports · Refugees, asylum,
displaced persons · Foreign labor

### housing

Housing finance and home ownership · Low- and moderate-income housing · Housing
supply and affordability · Public housing · Homelessness and emergency shelter ·
Residential rehabilitation and home repair · Housing industry and standards

### infrastructure

Roads and highways · Public transit · Railroads · Broadband and internet access
· Infrastructure development · Aviation and airports · Transportation programs
funding · Electric power generation and transmission · Dams and canals

### civil-rights

Voting rights · Racial and ethnic relations · Sex, gender, sexual orientation
discrimination · Disability and health-based discrimination · Age
discrimination · Due process and equal protection · First Amendment rights ·
Right of privacy · Freedom of information

### foreign-policy

Diplomacy, foreign officials, Americans abroad · Foreign aid and international
relief · International organizations and cooperation · Sanctions · Alliances ·
Human rights · Arms control and nonproliferation · Trade agreements and
negotiations *(also economy)* · Military assistance, sales, and agreements
*(also defense)*

---

## 5. What a tag does and does not mean

A tag says what a bill is **about**. It does not say which **direction** a
"yea" vote moves that topic. Two bills tagged *healthcare* can expand and
restrict coverage respectively, and today the alignment score treats a "yea" on
either the same way. That is the main known limitation of the current scoring
model and is called out on the methodology page.

---

## 6. Changing the mapping

1. Edit the tables in `jobs/ingest-congress/src/tagging.ts`.
2. Update this page to match.
3. Run `pnpm --filter @civreveal/ingest-congress test` — the tests reject
   unknown policy areas, invalid tags, and tags that can never be derived.
4. Re-run the ingest job; derived tags are recomputed on every run.

Proposals to change the mapping are welcome as pull requests. Because the
mapping decides which votes count toward which score, changes should come with
a short rationale in the PR.
