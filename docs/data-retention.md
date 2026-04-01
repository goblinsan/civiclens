# Data Retention Policy

## raw_payloads table

The `raw_payloads` table stores verbatim API responses captured during data ingestion.
Each row includes the source system identifier, source record identifier, retrieval
timestamp, the full JSON payload, and an optional SHA-256 checksum for integrity
verification.

### Retention schedule

| Age | Action |
|-----|--------|
| 0 – 24 months | Retained in the primary PostgreSQL database. |
| 24 – 84 months | Archived to cold object storage (e.g. S3 Glacier). The row is replaced with a pointer to the archive location. |
| > 84 months | Eligible for deletion after a compliance review. |

### Rationale

Raw payloads enable auditors to verify that any derived fact (a bill status, a vote
record, a politician attribute) can be traced back to a source API response.  Retaining
them for at least two years covers the typical legislative session lifespan.

### Querying the audit trail

```sql
-- Find all raw payloads for a given congress.gov bill record
SELECT *
FROM raw_payloads
WHERE source_system = 'congress.gov'
  AND source_id     = 'HR118-1234'
ORDER BY retrieved_at DESC;
```

## audit_logs table

The `audit_logs` table records every `INSERT`, `UPDATE`, and `DELETE` on core application
tables.  Rows are never deleted from `audit_logs`; they are archived after 84 months.

Each log entry captures:
- `table_name` – the affected table
- `record_id` – the affected row's primary key
- `action` – `insert`, `update`, or `delete`
- `old_data` / `new_data` – JSONB snapshots of the row before and after the change
- `source` – the subsystem that made the change (`api`, `ingest`, `seed`, `migration`)
- `performed_at` – exact timestamp
