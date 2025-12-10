# MCP SQL Query

Execute read-only SELECT queries.

## Steps

1. `query({ sql: "<SELECT...>", params: [], explain: true })`
2. Present results in table format

## Tables

| Table | Key Columns |
|-------|-------------|
| research_reports | id, original_query, final_report, rating, created_at |
| jobs | id, type, status, result, progress, created_at |
| doc_index | source_type, source_id, title, content |

## Safety

- SELECT only (no INSERT/UPDATE/DELETE)
- Use $1, $2 placeholders for params

## Query
$ARGUMENTS
