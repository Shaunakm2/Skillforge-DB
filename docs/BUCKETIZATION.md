# Bucketization: is it needed?

**Storage buckets: one more, later. Database partitioning: not now (except the audit log once it is big). Report bands: yes, kept in one place. Sharding: no.**

## 1. Storage buckets
Today: `lms-files` (course media, documents, question images, certificate backgrounds) and `lms-scorm` (SCORM, served only by the content site). Both private.

| Option | Verdict | Why |
|---|---|---|
| Keep two buckets, separated by path (`<org>/lcms/…`, `<org>/docs/…`) | **Yes, now** | Policies already check the org and folder. Simple to back up and restore. |
| Add `lms-records` for learner uploads (assignment evidence, signed forms) | **Yes, when learner uploads go live** | Personal data with a different retention period and stricter readers; gets its own size limit, file types, lifecycle and backup. |
| One bucket per course, department or customer | **No** | More policies and backups, no security gain. |
| Backups in the same storage | **No** | Already separate (encrypted nightly copy to R2). Keep it that way. |

On the organisation's own servers: the same three containers (Azure Blob / S3), private, signed links only.

## 2. Database partitioning
Expected size: ~3,500 people, ~1,000 courses, ~125,000 assignments, 0.6–1.2 million learning records. One PostgreSQL table per type with the existing indexes handles this easily. Partitioning adds work (future partitions, unique keys, harder migrations) for no gain at this size.

| Table | Verdict |
|---|---|
| Learning records, enrolments, assessments | **No.** Revisit above ~20 million rows. |
| Audit log | **Not yet.** Largest-growing table. Run `sf_audit_purge` (added in V36) monthly; partition by month once it passes ~20 million rows. |
| Login attempts | **No.** Cleaned up hourly. |

## 3. Report bands
Score ranges, TAT weeks, days overdue and tenure bands are useful. **Keep every band limit in Master data** so dashboards, MIS and exports agree. Follow-up: the gradebook 70 / 85 colour bands are still in code.

## 4. Sharding
**No.** One organisation, a few thousand users: one PostgreSQL server (plus a read replica if reports get heavy) is right for years.
