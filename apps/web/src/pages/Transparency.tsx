export default function Transparency() {
  return (
    <div style={{ maxWidth: '720px' }}>
      <h1 className="page-heading">Trust &amp; Transparency</h1>

      <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>
        CivicLens is a non-partisan civic information tool. This page explains
        in plain language what the platform does and does not claim, how data is
        handled, and what you should keep in mind when interpreting what you see.
      </p>

      {/* What CivicLens Is */}
      <div className="detail-section">
        <h2 className="detail-section-title">What CivicLens Is</h2>
        <ul style={{ paddingLeft: '1.5rem', lineHeight: 1.8, marginBottom: 0 }}>
          <li>
            A read-only window into publicly available U.S. federal legislative
            data, sourced exclusively from official government records.
          </li>
          <li>
            A tool that helps you explore how your elected representatives have
            voted on bills aligned with your own stated policy preferences.
          </li>
          <li>
            An open platform that clearly labels the origin of every piece of
            content — official government data vs. platform-generated
            interpretation.
          </li>
        </ul>
      </div>

      {/* What CivicLens Is Not */}
      <div className="detail-section">
        <h2 className="detail-section-title">What CivicLens Is Not</h2>
        <ul style={{ paddingLeft: '1.5rem', lineHeight: 1.8, marginBottom: 0 }}>
          <li>
            <strong>Not an endorsement tool.</strong> CivicLens does not tell you
            who to vote for or which positions are correct.
          </li>
          <li>
            <strong>Not affiliated with any government body.</strong> CivicLens
            is an independent project and is not operated by or on behalf of any
            federal, state, or local government agency.
          </li>
          <li>
            <strong>Not a polling or survey platform.</strong> The public
            sentiment widget collects anonymous voluntary reactions and is not a
            scientific poll.
          </li>
          <li>
            <strong>Not a legal or political advisory service.</strong> Nothing
            on this site constitutes legal advice, political consulting, or
            campaign material.
          </li>
        </ul>
      </div>

      {/* Official Data vs. Platform Content */}
      <div className="detail-section">
        <h2 className="detail-section-title">Official Data vs. Platform Content</h2>
        <p style={{ marginBottom: '1rem' }}>
          CivicLens clearly distinguishes between two types of content using
          visual badges throughout the interface:
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
            <span className="source-label source-label-official" style={{ flexShrink: 0, marginTop: '0.125rem' }}>
              🏛 Official Data
            </span>
            <span>
              Sourced verbatim from a U.S. government API or XML feed. Includes
              bill titles, summaries, vote results, and politician profiles.
              CivicLens stores the raw source response alongside each record so
              it can be verified.
            </span>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
            <span className="source-label source-label-platform" style={{ flexShrink: 0, marginTop: '0.125rem' }}>
              Platform
            </span>
            <span>
              Generated or computed by CivicLens. Includes policy tags applied
              to bills, alignment scores, and aggregated public sentiment counts.
              These are not official government records and represent editorial
              or algorithmic judgments.
            </span>
          </div>
        </div>
        <p style={{ marginBottom: 0 }}>
          See the <a href="/data-sources">Data Sources</a> page for a full list
          of every source used and the <a href="/methodology">Scoring
          Methodology</a> page for how alignment scores are calculated.
        </p>
      </div>

      {/* Known Limitations */}
      <div className="detail-section">
        <h2 className="detail-section-title">Known Limitations</h2>
        <ul style={{ paddingLeft: '1.5rem', lineHeight: 1.8, marginBottom: 0 }}>
          <li>
            <strong>Coverage gaps.</strong> Data coverage depends on what the
            upstream government APIs provide. Some historical bills or older
            vote records may be missing or incomplete.
          </li>
          <li>
            <strong>Update lag.</strong> There is a delay between when official
            records change and when CivicLens reflects those changes. Each
            record displays its last-updated timestamp so you can assess
            freshness.
          </li>
          <li>
            <strong>Policy tag accuracy.</strong> Bills are tagged with policy
            categories using a rules-based system. A single tag may not capture
            the full scope or complexity of a bill.
          </li>
          <li>
            <strong>Score sensitivity.</strong> Alignment scores are only as
            accurate as the bill tags and the votes available. Politicians with
            few relevant votes will show a "Low" or "No data" confidence rating.
          </li>
          <li>
            <strong>No AI-generated content.</strong> CivicLens does not
            currently use large language models to generate or modify any
            content. Bill summaries shown on the site are sourced directly from
            the Congressional Research Service via Congress.gov.
          </li>
        </ul>
      </div>

      {/* Update Cadence */}
      <div className="detail-section">
        <h2 className="detail-section-title">Update Cadence</h2>
        <p style={{ marginBottom: '0.75rem' }}>
          The ingestion pipeline fetches data from government sources on a
          scheduled basis. Each ingestion run:
        </p>
        <ul style={{ paddingLeft: '1.5rem', lineHeight: 1.8, marginBottom: '0.75rem' }}>
          <li>Pulls current congressional membership from Congress.gov.</li>
          <li>Fetches bills updated since the last run (or all bills if running from scratch).</li>
          <li>Fetches Senate roll-call votes for the current session.</li>
          <li>Fetches House roll-call votes for the current year.</li>
        </ul>
        <p style={{ marginBottom: 0 }}>
          Every record on the site displays an "Updated" timestamp that reflects
          the last time the underlying data was refreshed from the source.
        </p>
      </div>

      {/* How to Report Issues */}
      <div className="detail-section">
        <h2 className="detail-section-title">How to Report Issues</h2>
        <p style={{ marginBottom: '0.75rem' }}>
          If you notice data that appears incorrect, outdated, or misleading,
          please report it:
        </p>
        <ul style={{ paddingLeft: '1.5rem', lineHeight: 1.8, marginBottom: '0.75rem' }}>
          <li>
            <strong>GitHub Issues:</strong>{' '}
            <a
              href="https://github.com/goblinsan/civiclens/issues"
              target="_blank"
              rel="noopener noreferrer"
            >
              github.com/goblinsan/civiclens/issues ↗
            </a>
          </li>
        </ul>
        <p style={{ marginBottom: 0 }}>
          Please include the URL of the affected page, a description of what
          appears wrong, and (if known) what the correct information is.
        </p>
      </div>

      <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
        CivicLens is open source. You can inspect the code and data pipeline at{' '}
        <a
          href="https://github.com/goblinsan/civiclens"
          target="_blank"
          rel="noopener noreferrer"
        >
          github.com/goblinsan/civiclens ↗
        </a>
        .
      </p>
    </div>
  );
}
