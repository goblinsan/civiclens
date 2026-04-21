export default function DataSources() {
  return (
    <div style={{ maxWidth: '720px' }}>
      <h1 className="page-heading">Data Sources</h1>

      <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>
        CivReveal pulls from official U.S. government sources only. This page
        documents every source, what it provides, how often data is refreshed,
        and known gaps or limitations.
      </p>

      {/* Congress.gov */}
      <div className="detail-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <h2 className="detail-section-title" style={{ marginBottom: 0, border: 'none', paddingBottom: 0 }}>
            Congress.gov API
          </h2>
          <span className="source-label source-label-official">Official</span>
        </div>
        <p style={{ marginBottom: '0.75rem' }}>
          Provided by the U.S. Library of Congress.{' '}
          <a href="https://api.congress.gov" target="_blank" rel="noopener noreferrer">
            api.congress.gov ↗
          </a>
        </p>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.9375rem' }}>
          <tbody>
            <tr>
              <th style={{ textAlign: 'left', padding: '0.375rem 1rem 0.375rem 0', fontWeight: 600, whiteSpace: 'nowrap', width: '30%' }}>
                Provides
              </th>
              <td style={{ padding: '0.375rem 0' }}>
                Bill titles, summaries, status, sponsors, introduced dates, and
                congressional member biographical data.
              </td>
            </tr>
            <tr>
              <th style={{ textAlign: 'left', padding: '0.375rem 1rem 0.375rem 0', fontWeight: 600 }}>
                Refresh cadence
              </th>
              <td style={{ padding: '0.375rem 0' }}>
                Ingested on a scheduled basis; typically updated within 24 hours
                of official record changes on Congress.gov.
              </td>
            </tr>
            <tr>
              <th style={{ textAlign: 'left', padding: '0.375rem 1rem 0.375rem 0', fontWeight: 600 }}>
                Limitations
              </th>
              <td style={{ padding: '0.375rem 0' }}>
                Bill summaries are written by the Congressional Research Service
                and may lag behind a bill's current status. Some older bills
                lack machine-readable summaries.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Senate.gov */}
      <div className="detail-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <h2 className="detail-section-title" style={{ marginBottom: 0, border: 'none', paddingBottom: 0 }}>
            Senate.gov Roll-Call Feed
          </h2>
          <span className="source-label source-label-official">Official</span>
        </div>
        <p style={{ marginBottom: '0.75rem' }}>
          Published by the U.S. Senate.{' '}
          <a href="https://www.senate.gov/legislative/votes_new.htm" target="_blank" rel="noopener noreferrer">
            senate.gov ↗
          </a>
        </p>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.9375rem' }}>
          <tbody>
            <tr>
              <th style={{ textAlign: 'left', padding: '0.375rem 1rem 0.375rem 0', fontWeight: 600, whiteSpace: 'nowrap', width: '30%' }}>
                Provides
              </th>
              <td style={{ padding: '0.375rem 0' }}>
                Senate roll-call vote results per session, including individual
                senator positions (Yea/Nay/Abstain/Not Voting).
              </td>
            </tr>
            <tr>
              <th style={{ textAlign: 'left', padding: '0.375rem 1rem 0.375rem 0', fontWeight: 600 }}>
                Refresh cadence
              </th>
              <td style={{ padding: '0.375rem 0' }}>
                XML feeds are fetched per ingestion run. Senate votes are
                typically published within hours of a vote being completed.
              </td>
            </tr>
            <tr>
              <th style={{ textAlign: 'left', padding: '0.375rem 1rem 0.375rem 0', fontWeight: 600 }}>
                Limitations
              </th>
              <td style={{ padding: '0.375rem 0' }}>
                Only covers the current and most recent congressional sessions.
                Procedural votes not tied to a specific bill are ingested but
                not linked to bill records.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* House Clerk */}
      <div className="detail-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <h2 className="detail-section-title" style={{ marginBottom: 0, border: 'none', paddingBottom: 0 }}>
            House Clerk XML Feed
          </h2>
          <span className="source-label source-label-official">Official</span>
        </div>
        <p style={{ marginBottom: '0.75rem' }}>
          Published by the Office of the Clerk, U.S. House of Representatives.{' '}
          <a href="https://clerk.house.gov" target="_blank" rel="noopener noreferrer">
            clerk.house.gov ↗
          </a>
        </p>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.9375rem' }}>
          <tbody>
            <tr>
              <th style={{ textAlign: 'left', padding: '0.375rem 1rem 0.375rem 0', fontWeight: 600, whiteSpace: 'nowrap', width: '30%' }}>
                Provides
              </th>
              <td style={{ padding: '0.375rem 0' }}>
                House roll-call vote results per year, including individual
                representative positions (Yea/Nay/Not Voting).
              </td>
            </tr>
            <tr>
              <th style={{ textAlign: 'left', padding: '0.375rem 1rem 0.375rem 0', fontWeight: 600 }}>
                Refresh cadence
              </th>
              <td style={{ padding: '0.375rem 0' }}>
                XML feeds are fetched by calendar year during each ingestion run.
              </td>
            </tr>
            <tr>
              <th style={{ textAlign: 'left', padding: '0.375rem 1rem 0.375rem 0', fontWeight: 600 }}>
                Limitations
              </th>
              <td style={{ padding: '0.375rem 0' }}>
                Coverage is limited to the current year by default. Historical
                years can be configured but are not fetched automatically.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Bioguide */}
      <div className="detail-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <h2 className="detail-section-title" style={{ marginBottom: 0, border: 'none', paddingBottom: 0 }}>
            Biographical Directory of Congress
          </h2>
          <span className="source-label source-label-official">Official</span>
        </div>
        <p style={{ marginBottom: '0.75rem' }}>
          Published by the U.S. Congress.{' '}
          <a href="https://bioguide.congress.gov" target="_blank" rel="noopener noreferrer">
            bioguide.congress.gov ↗
          </a>
        </p>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.9375rem' }}>
          <tbody>
            <tr>
              <th style={{ textAlign: 'left', padding: '0.375rem 1rem 0.375rem 0', fontWeight: 600, whiteSpace: 'nowrap', width: '30%' }}>
                Provides
              </th>
              <td style={{ padding: '0.375rem 0' }}>
                Politician profile photos, party affiliation, state, chamber,
                and website URLs.
              </td>
            </tr>
            <tr>
              <th style={{ textAlign: 'left', padding: '0.375rem 1rem 0.375rem 0', fontWeight: 600 }}>
                Refresh cadence
              </th>
              <td style={{ padding: '0.375rem 0' }}>
                Updated when congressional membership data changes, typically at
                the start of a new congress or following a special election.
              </td>
            </tr>
            <tr>
              <th style={{ textAlign: 'left', padding: '0.375rem 1rem 0.375rem 0', fontWeight: 600 }}>
                Limitations
              </th>
              <td style={{ padding: '0.375rem 0' }}>
                Photo availability varies. Some members do not have publicly
                listed official websites.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Platform-generated content */}
      <div className="detail-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <h2 className="detail-section-title" style={{ marginBottom: 0, border: 'none', paddingBottom: 0 }}>
            Platform-Generated Content
          </h2>
          <span className="source-label source-label-platform">Platform</span>
        </div>
        <p style={{ marginBottom: '0.75rem' }}>
          The following content is produced by CivReveal, not sourced from an
          official government record.
        </p>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.9375rem' }}>
          <tbody>
            <tr>
              <th style={{ textAlign: 'left', padding: '0.375rem 1rem 0.375rem 0', fontWeight: 600, whiteSpace: 'nowrap', width: '30%' }}>
                Policy tags
              </th>
              <td style={{ padding: '0.375rem 0' }}>
                Bills are tagged with policy categories (e.g., Healthcare,
                Education) using a rules-based system. Tags are editorial
                judgments and may not capture every aspect of a bill.
              </td>
            </tr>
            <tr>
              <th style={{ textAlign: 'left', padding: '0.375rem 1rem 0.375rem 0', fontWeight: 600 }}>
                Alignment scores
              </th>
              <td style={{ padding: '0.375rem 0' }}>
                Computed by CivReveal from your questionnaire responses and
                politician voting records. See the{' '}
                <a href="/methodology">Scoring Methodology</a> page for full
                details.
              </td>
            </tr>
            <tr>
              <th style={{ textAlign: 'left', padding: '0.375rem 1rem 0.375rem 0', fontWeight: 600 }}>
                Public sentiment
              </th>
              <td style={{ padding: '0.375rem 0' }}>
                Aggregated anonymous reactions (Support / Oppose / Neutral)
                submitted voluntarily by site visitors. Not a scientific poll.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
        All raw source data is stored verbatim and checksummed at ingest time so
        that every derived fact can be traced back to a source record. See the{' '}
        <a href="/transparency">Trust &amp; Transparency</a> page for more
        information on how CivReveal handles data integrity.
      </p>
    </div>
  );
}
