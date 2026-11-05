# Policy goals

The goal statements that replace the ten topic questions in the
questionnaire (see [scoring-methodology.md](./scoring-methodology.md) §7 for
why the topic-based model could not express agreement).

**Where this lives.** The canonical, machine-read list is
[`data/policy-goals.json`](../data/policy-goals.json); the tables below mirror
it and a test fails if they drift. `pnpm db:sync-goals` (run by the ingest
workflow after migrations) upserts it into `policy_goals`. Bill → goal effect
codings live in [`data/bill-goal-effects/`](../data/bill-goal-effects/), one
file per congress, and are reviewed by the pull request that merges them.

**How to change a goal.** Edit both the JSON and the table, in one pull
request. Mark anything that reads as unfair to one side, anything that is
really two goals, anything missing, and any wording a reader on either side
would not sign as a neutral description of a direction. A shorter list that
is fair beats a longer one that is not.

---

## How goals work

- A **goal** is a concrete direction of federal action, written as a verb
  phrase. It is something Congress can advance or hinder with a bill.
- Goals are **independent**. Supporting one never implies a position on
  another. "Expand federal support for solar and wind" and "Expand nuclear
  power" are both answerable with *support*; nothing forces a trade-off.
- The questionnaire asks, per goal: **support / oppose / skip**, and for
  answered goals, **how much it matters** (a little / some / a lot). You answer
  only the areas you care about.
- Every bill that reaches a roll-call is **coded per goal it touches**:
  *advances* or *hinders*, with a strength, a written rationale, and the
  passage of the official CRS summary the rationale rests on. Coding is
  editorial, public, and disputable from the bill page. Uncoded bills affect
  nothing.
- A member's score on a goal comes from their yea/nay votes on coded bills:
  a yea on a bill that advances a goal you support counts for them; a yea on
  one that hinders it counts against. Procedural votes are excluded until
  coded separately.

### Writing rules

1. **Means, not ends.** "Lower health care costs" is an outcome everyone
   wants; it is not a goal here. "Let Medicare negotiate drug prices" is.
2. **One direction per goal.** If a reader could support half of it, split it.
3. **The opposite must be a legitimate position.** Each statement should read
   as a fair description to someone who would answer *oppose*.
4. **No loaded words.** Not "reform", "protect", "fix", "common-sense",
   "radical", "fair share", "handout". Name the mechanism instead.
5. **Federal scope.** Only directions Congress votes on.
6. **A bill can be found for it.** Each goal lists the official CRS subject
   terms that make a bill a *candidate* for coding against it. These are a
   search aid, not the coding: the direction is decided per bill.

---

## Energy

| Slug | Goal | A bill that advances it typically… | Candidate official terms |
| --- | --- | --- | --- |
| `energy-renewables-support` | Expand federal financial support for solar and wind power | creates or extends tax credits, grants or loan guarantees for renewable generation; repeal or phase-out hinders | Alternative and renewable resources; Solar energy; Wind power; Energy research |
| `energy-nuclear-expand` | Expand nuclear power generation | funds advanced reactor demonstration, shortens NRC licensing, extends liability or fuel-supply support | Nuclear power; Energy research; Radioactive wastes and releases |
| `energy-fossil-expand` | Expand domestic oil, gas and coal production | opens federal lands or waters to leasing, speeds pipeline or export approvals, limits royalty increases | Oil and gas; Coal; Pipelines; Public lands and natural resources |
| `energy-permitting-streamline` | Shorten federal permitting for energy and transmission projects | sets review deadlines, narrows NEPA scope, limits litigation windows (for any energy type) | Environmental regulatory procedures; Electric power generation, transmission; Infrastructure development |
| `energy-efficiency-standards` | Set stricter federal efficiency standards for appliances, vehicles and buildings | raises or preserves standards; a bill blocking a standard hinders | Energy efficiency and conservation; Motor vehicles; Building construction |
| `energy-ev-support` | Expand federal support for electric vehicles and charging | purchase credits, charging grants, fleet mandates; repeal hinders | Hybrid, electric, and advanced technology vehicles; Motor fuels |
| `energy-grid-invest` | Increase federal investment in the electric grid and energy storage | transmission funding, storage credits, interregional planning mandates | Electric power generation, transmission; Energy storage, supplies, demand |

## Environment and public lands

| Slug | Goal | A bill that advances it typically… | Candidate official terms |
| --- | --- | --- | --- |
| `env-ghg-limits` | Limit greenhouse-gas emissions by federal rule | authorises or preserves EPA emissions standards, carbon fees or methane rules; a bill blocking or repealing them hinders | Climate change and greenhouse gases; Air quality |
| `env-pollution-rules` | Tighten federal limits on air and water pollution | stricter standards for PFAS, particulates, discharge permits; rollbacks hinder | Air quality; Water quality; Hazardous wastes and toxic substances |
| `env-public-lands-protect` | Keep more federal land under conservation protection | designates wilderness, monuments or refuges; transfers, sales or opening to extraction hinder | Public lands; Land use and conservation; Wilderness; Parks, recreation areas, trails |
| `env-species-protect` | Keep strong federal protection for endangered species | preserves or extends Endangered Species Act listings and habitat rules; delistings by statute or exemptions hinder | Endangered and threatened species; Wildlife conservation and habitat protection |
| `env-climate-adaptation` | Fund federal programmes for climate and disaster resilience | flood, wildfire and coastal resilience grants, FEMA mitigation funding | Climate change and greenhouse gases; Emergency planning and evacuation; Floods and storm protection |
| `env-international-climate` | Keep the U.S. in international climate agreements and climate finance | funds Green Climate Fund, preserves treaty participation; withdrawal or defunding hinders | Climate change and greenhouse gases; International organizations and cooperation |

## Health care

| Slug | Goal | A bill that advances it typically… | Candidate official terms |
| --- | --- | --- | --- |
| `health-public-coverage-expand` | Expand public health coverage (Medicare, Medicaid, ACA subsidies) | lowers Medicare age, extends enhanced ACA credits, expands Medicaid eligibility; cuts or work requirements hinder | Health care coverage and access; Medicare; Medicaid; Health care costs and insurance |
| `health-single-payer` | Replace private insurance with a single federal health plan | Medicare for All–type bills | Health care coverage and access |
| `health-drug-price-negotiation` | Let the federal government negotiate or cap prescription drug prices | extends Medicare negotiation, insulin caps, importation; repeal hinders | Prescription drugs; Medicare |
| `health-private-market-expand` | Expand private and employer-based coverage options | association health plans, HSA expansion, short-term plans, cross-state sale | Health care costs and insurance; Employee benefits and pensions |
| `health-abortion-access` | Keep abortion legal and accessible under federal law | codifies access, funds providers; federal restrictions or funding bans hinder | Abortion; Women's health |
| `health-mental-health-fund` | Increase federal funding for mental health and addiction treatment | SAMHSA funding, parity enforcement, crisis lines | Mental health; Drug, alcohol, tobacco use |
| `health-rural-fund` | Increase federal support for rural hospitals and providers | rural hospital payments, telehealth extensions, provider loan forgiveness | Rural conditions and development; Hospital care; Health personnel |
| `health-vaccine-public-health` | Fund federal public-health and vaccination programmes | CDC and vaccine programme funding, pandemic preparedness; cuts hinder | Health promotion and preventive care; Immunology and vaccination; Emergency planning and evacuation |

## Education

| Slug | Goal | A bill that advances it typically… | Candidate official terms |
| --- | --- | --- | --- |
| `edu-k12-federal-fund` | Increase federal funding for public K–12 schools | Title I, IDEA, school meals, facilities | Elementary and secondary education; Education programs funding; Special education |
| `edu-school-choice` | Let federal money follow students to private, charter or home schooling | federal scholarship tax credits, vouchers, charter grants | Elementary and secondary education; Income tax credits |
| `edu-student-debt-relief` | Cancel or reduce existing federal student loan debt | forgiveness programmes, income-driven repayment expansion; bills blocking relief hinder | Student aid and college costs; Higher education |
| `edu-college-cost-aid` | Increase federal grants and tuition support for college | Pell increases, free community college | Student aid and college costs; Higher education |
| `edu-vocational-fund` | Expand federal support for apprenticeships and vocational training | Perkins funding, apprenticeship grants, short-term Pell | Vocational and technical education; Employment and training programs |
| `edu-early-childhood` | Fund federal pre-K and child care programmes | Head Start, child care block grants, universal pre-K | Preschool education; Child care and development |
| `edu-federal-role-reduce` | Reduce the federal role in education policy | abolishes or shrinks the Department of Education, block-grants programmes, removes federal mandates | Education programs funding; Executive agency funding and structure |

## Taxes and spending

| Slug | Goal | A bill that advances it typically… | Candidate official terms |
| --- | --- | --- | --- |
| `tax-high-income-raise` | Raise taxes on high incomes and large estates | higher top rates, estate tax expansion, capital-gains alignment; cuts for those brackets hinder | Income tax rates; Transfer and inheritance taxes; Capital gains tax |
| `tax-corporate-raise` | Raise taxes on corporations | higher corporate rate, minimum tax, buyback excise; cuts hinder | Corporate finance and management; Income tax rates |
| `tax-broad-cuts` | Cut income taxes across the board | rate reductions for most brackets, standard-deduction increases | Income tax rates; Income tax deductions |
| `tax-family-credits` | Expand tax credits for families and low earners | child tax credit, EITC, child care credit expansions | Income tax credits; Child care and development |
| `fiscal-deficit-reduce` | Reduce the federal deficit through spending limits | caps, sequestration, balanced-budget rules; bills raising spending without offsets hinder | Budget deficits and national debt; Budget process |
| `fiscal-debt-ceiling-raise` | Raise or suspend the debt ceiling when needed | clean debt-limit increases; refusals or conditions hinder | Budget deficits and national debt |

## Work and the safety net

| Slug | Goal | A bill that advances it typically… | Candidate official terms |
| --- | --- | --- | --- |
| `work-min-wage-raise` | Raise the federal minimum wage | increases, indexing; preemption of increases hinders | Minimum wage; Wages and earnings |
| `work-union-strengthen` | Strengthen federal protections for union organising | PRO Act–type measures, penalties for interference; right-to-work federalisation hinders | Labor-management relations; Employee hiring |
| `work-paid-leave` | Create a federal paid family and medical leave programme | paid leave insurance, mandated leave | Employee leave; Family relationships |
| `safety-net-expand` | Expand federal assistance programmes (SNAP, TANF, housing aid) | benefit increases, eligibility expansion; work requirements, cuts or time limits hinder | Poverty and welfare assistance; Food assistance and relief |
| `social-security-preserve-benefits` | Keep Social Security benefits at current or higher levels | benefit increases, payroll-tax cap lift; retirement-age increases or benefit formula cuts hinder | Social security and elderly assistance |
| `work-gig-classification` | Keep independent-contractor status for gig and freelance work | codifies contractor tests; reclassification mandates hinder | Employee hiring; Wages and earnings |

## Defense and veterans

| Slug | Goal | A bill that advances it typically… | Candidate official terms |
| --- | --- | --- | --- |
| `defense-spending-increase` | Increase total defense spending | topline increases above inflation; cuts or freezes hinder | Defense spending; Military procurement, research, weapons development |
| `defense-overseas-reduce` | Reduce U.S. military deployments abroad | troop withdrawals, basing reductions, AUMF repeal | Military operations and strategy; Military facilities and property |
| `defense-nuclear-modernise` | Modernise and expand the nuclear arsenal | new warheads, delivery systems; arms-reduction mandates hinder | Nuclear weapons; Arms control and nonproliferation |
| `veterans-benefits-expand` | Expand veterans' health care and benefits | toxic-exposure coverage, GI Bill expansions, VA staffing | Veterans' medical care; Veterans' education, employment, rehabilitation; Veterans' pensions and compensation |
| `defense-war-powers` | Require congressional approval before military action | war-powers resolutions, AUMF sunsets; open-ended authorisations hinder | Military operations and strategy; Congressional oversight |

## Immigration

| Slug | Goal | A bill that advances it typically… | Candidate official terms |
| --- | --- | --- | --- |
| `imm-border-enforcement` | Increase border enforcement and physical barriers | wall funding, more agents, detention capacity | Border security and unlawful immigration; Detention of persons |
| `imm-legalisation-path` | Create a path to legal status for undocumented residents | DACA codification, earned legalisation; bills barring it hinder | Immigration status and procedures; Citizenship and naturalization |
| `imm-legal-levels-increase` | Increase legal immigration and work visas | H-1B or H-2 caps up, green-card backlog relief, per-country cap removal | Visas and passports; Foreign labor |
| `imm-asylum-restrict` | Restrict asylum eligibility and speed removals | third-country bars, expedited removal expansion; bills expanding asylum hinder | Refugees, asylum and displaced persons; Immigration status and procedures |
| `imm-interior-enforcement` | Expand interior enforcement and mandatory employment verification | E-Verify mandates, cooperation requirements for local police, deportation priorities | Border security and unlawful immigration; Employee hiring |
| `imm-refugee-admissions` | Increase refugee admissions | higher caps, special immigrant visa expansions | Refugees, asylum and displaced persons |

## Housing

| Slug | Goal | A bill that advances it typically… | Candidate official terms |
| --- | --- | --- | --- |
| `housing-federal-build` | Increase federal funding for affordable housing construction | LIHTC expansion, HOME and public-housing capital funds | Low- and moderate-income housing; Public housing; Housing supply and affordability |
| `housing-vouchers-expand` | Expand rental assistance and housing vouchers | Section 8 funding, universal voucher proposals; cuts hinder | Low- and moderate-income housing; Poverty and welfare assistance |
| `housing-zoning-incentives` | Tie federal money to local zoning that allows more housing | YIMBY-style grant conditions, density incentives | Housing supply and affordability; Land use and conservation |
| `housing-homeownership-support` | Expand federal support for first-time homebuyers | down-payment assistance, FHA expansion, mortgage credits | Housing finance and home ownership |
| `housing-homelessness-fund` | Increase federal funding for homelessness services | Continuum of Care, Housing First funding | Homelessness and emergency shelter |

## Infrastructure

| Slug | Goal | A bill that advances it typically… | Candidate official terms |
| --- | --- | --- | --- |
| `infra-transit-rail-fund` | Increase federal funding for public transit and passenger rail | Amtrak, transit formula and capital grants | Public transit; Railroads; Transportation programs funding |
| `infra-highway-fund` | Increase federal funding for roads and highways | highway trust fund increases, bridge programmes | Roads and highways; Transportation programs funding |
| `infra-broadband-fund` | Fund universal broadband access | BEAD-type grants, affordability subsidies | Internet, web applications, social media; Telephone and wireless communication |
| `infra-water-fund` | Increase federal funding for water systems | lead-pipe replacement, state revolving funds, dam safety | Water resources funding; Water quality; Dams and canals |
| `infra-user-fees-private` | Fund infrastructure through user fees and private investment | tolling, public-private partnerships, mileage fees | Transportation programs funding; Public-private cooperation |

## Civil rights, justice and public safety

| Slug | Goal | A bill that advances it typically… | Candidate official terms |
| --- | --- | --- | --- |
| `rights-voting-access` | Expand federal voting-access rules | automatic registration, mail voting standards, preclearance restoration; federal ID or roll-purge mandates hinder | Voting rights; Elections, voting, political campaign regulation |
| `rights-voter-id` | Require identification and citizenship proof to vote in federal elections | ID mandates, citizenship documentation | Elections, voting, political campaign regulation; Voting rights |
| `rights-lgbt-protections` | Add sexual orientation and gender identity to federal anti-discrimination law | Equality Act–type bills; exemptions or rollbacks hinder | Sex, gender, sexual orientation discrimination |
| `rights-gun-restrictions` | Tighten federal firearm regulation | universal background checks, assault-weapons limits, red-flag funding; concealed-carry reciprocity or repeal hinder | Firearms and explosives |
| `rights-gun-rights-expand` | Expand federal protection of firearm ownership | national reciprocity, repeal of registration or NFA provisions | Firearms and explosives |
| `justice-sentencing-reduce` | Reduce federal sentences and incarceration | mandatory-minimum repeal, retroactive relief, reentry funding; new mandatory minimums hinder | Sentencing; Correctional facilities and imprisonment |
| `justice-police-fund` | Increase federal funding for local police | COPS grants, equipment programmes | Law enforcement administration and funding |
| `justice-police-accountability` | Set federal standards for police conduct and accountability | qualified-immunity limits, use-of-force standards, misconduct registries | Law enforcement officers; Civil actions and liability |
| `rights-privacy-surveillance` | Limit federal surveillance and data collection | FISA 702 warrant requirements, data-broker limits; reauthorisations without limits hinder | Right of privacy; Intelligence activities, surveillance, classified information |
| `rights-campaign-finance` | Tighten federal limits and disclosure for campaign money | disclosure mandates, public financing, contribution limits | Elections, voting, political campaign regulation |

## Foreign policy and trade

| Slug | Goal | A bill that advances it typically… | Candidate official terms |
| --- | --- | --- | --- |
| `foreign-ukraine-aid` | Continue military and economic aid to Ukraine | appropriations, lend-lease; conditions or cuts hinder | Ukraine; Military assistance, sales, and agreements; Foreign aid and international relief |
| `foreign-israel-aid` | Continue military aid to Israel without new conditions | appropriations, Iron Dome funding; conditioning aid on conduct hinders | Israel; Military assistance, sales, and agreements |
| `foreign-aid-overall` | Maintain or increase overall foreign aid and development funding | USAID, global health, humanitarian accounts; cuts hinder | Foreign aid and international relief |
| `foreign-china-restrict` | Restrict trade and investment with China | outbound investment screening, tariffs, entity-list expansion, TikTok-type divestiture | China; Trade restrictions; Foreign and international investments |
| `trade-tariffs-increase` | Raise tariffs to protect domestic industry | broad or sectoral tariff authority; tariff rollbacks hinder | Tariffs; Trade restrictions |
| `trade-agreements-expand` | Enter new free-trade agreements | trade promotion authority, agreement approvals | Trade agreements and negotiations; Free trade and trade barriers |
| `foreign-alliances-maintain` | Maintain NATO and treaty alliance commitments | bars on withdrawal, burden-sharing funding; withdrawal authorisations hinder | Collective security; Europe; International organizations and cooperation |
| `foreign-sanctions-expand` | Expand sanctions on adversary governments | Russia, Iran, North Korea sanctions bills; waivers or lifting hinder | Sanctions; Russia; Iran |

---

## Decisions taken at approval

1. **Count.** All 79 goals across 12 areas ship. Respondents pick the areas
   they care about, so the list is a menu, not a form to complete.
2. **Paired goals.** The near-opposite pairs on guns and voting stay, because
   the bills themselves divide that way.
3. **Energy** is its own area here even though the bill *tags* fold it into
   Environment; tags describe topics, goals describe directions.
4. **Not yet covered.** Agriculture, technology and AI, congressional process
   and government operations. Add an area when there are floor votes to code
   against it.
5. **Importance** has three levels: a little / some / a lot.
