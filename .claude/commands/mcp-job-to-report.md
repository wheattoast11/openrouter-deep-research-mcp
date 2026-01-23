# Get Report from Job ID

Convert job_id to report. Single-command bridge.

## Steps

1. `job_status({ job_id: "$ARGUMENTS" })`
2. If status="succeeded": extract `reportId` field
3. `get_report({ reportId: "<extracted_id>" })`
4. Present report

## ID Types

| Type | Format | Example |
|------|--------|---------|
| job_id | `job_<ts>_<rand>` | job_1234567890_abc123 |
| reportId | numeric | 5, 42 |

## Common Errors

- "Invalid report ID format" -> You passed job_id instead of reportId
- "Job not found" -> Job expired (1hr TTL) or invalid ID

## Job ID
$ARGUMENTS
