# MCP Search

Search existing knowledge base (reports + docs).

## Steps

1. `search({ q: "$ARGUMENTS", k: 10, scope: "both" })`
2. Summarize matches with relevance scores
3. For details: `get_report({ reportId: "<id>" })`

## Options

| Param | Values | Default |
|-------|--------|---------|
| k | 1-100 | 10 |
| scope | "both", "reports", "docs" | both |
| rerank | true/false | false |

## Query
$ARGUMENTS
