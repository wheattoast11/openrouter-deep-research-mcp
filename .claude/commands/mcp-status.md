# MCP Status

Comprehensive server health check.

## Steps

1. `ping()` -> basic connectivity
2. `get_server_status()` -> db, embedder, jobs
3. `history({ limit: 5 })` -> recent reports
4. `task_list({ limit: 5 })` -> active jobs

## Key Indicators

| Component | Healthy State |
|-----------|---------------|
| database.initialized | true |
| embedder.ready | true |
| jobs.running | 0-5 normal |
| jobs.failed | 0 ideal |
