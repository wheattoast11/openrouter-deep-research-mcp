# Idempotency System Quick Reference

**TL;DR:** Job submissions are now idempotent by default. Duplicate requests return the same job instead of creating duplicates.

## How It Works

```
Same params → Same idempotency key → Same job returned
```

## Key Features

✅ **Automatic duplicate detection** - Same query/params = same job
✅ **Race condition safe** - Concurrent requests handled atomically
✅ **Smart caching** - Return cached results for succeeded jobs
✅ **Configurable TTL** - Keys expire after 1 hour (configurable)
✅ **Force override** - Use `force_new: true` to bypass

## API Usage

### Default Behavior (Idempotent)

```javascript
// First submission
const result1 = await submitResearch({
  query: "What is AI?",
  costPreference: "low"
});
// → { job_id: "job_123", status: "queued", idempotency_key: "abc..." }

// Duplicate submission (same params)
const result2 = await submitResearch({
  query: "What is AI?",
  costPreference: "low"
});
// → { job_id: "job_123", status: "running", existing_job: true, idempotency_key: "abc..." }
```

### Force New Job

```javascript
const result = await submitResearch({
  query: "What is AI?",
  costPreference: "low",
  force_new: true  // ← Bypass idempotency
});
// → { job_id: "job_456", forced_new: true, ... }
```

### Custom Idempotency Key

```javascript
const result = await submitResearch({
  query: "What is AI?",
  idempotency_key: "my-custom-key-123"  // ← Use your own key
});
// → { job_id: "job_789", idempotency_key: "my-custom-key-123", ... }
```

## Response Types

### New Job Created
```json
{
  "job_id": "job_123",
  "status": "queued",
  "idempotency_key": "abc...",
  "sse_url": "...",
  "ui_url": "..."
}
```

### Existing Job (Duplicate)
```json
{
  "job_id": "job_123",
  "status": "running",
  "existing_job": true,
  "message": "Job already running. Use get_job_status to monitor.",
  "idempotency_key": "abc...",
  "sse_url": "...",
  "ui_url": "..."
}
```

### Cached Result (Job Completed)
```json
{
  "job_id": "job_123",
  "status": "succeeded",
  "cached": true,
  "result": { "message": "...", "report_id": "..." },
  "idempotency_key": "abc..."
}
```

### Failed Job
```json
{
  "job_id": "job_123",
  "status": "failed",
  "error": "Previous job failed. Use force_new=true to retry.",
  "idempotency_key": "abc..."
}
```

## Configuration

### Environment Variables

```bash
# Enable/disable (default: true)
IDEMPOTENCY_ENABLED=true

# TTL in seconds (default: 3600 = 1 hour)
IDEMPOTENCY_TTL_SECONDS=3600

# Retry policy
IDEMPOTENCY_RETRY_ON_FAILURE=true
IDEMPOTENCY_MAX_RETRIES=3
```

### Disable Idempotency

```bash
# In .env
IDEMPOTENCY_ENABLED=false
```

Or programmatically:

```javascript
config.idempotency.enabled = false;
```

## What Gets Deduplicated?

### Included in Key (Creates Same Job)
- ✅ `query` (normalized, case-insensitive)
- ✅ `costPreference`
- ✅ `audienceLevel`
- ✅ `outputFormat`
- ✅ `includeSources`
- ✅ `maxLength`
- ✅ `images` (count + first URL)
- ✅ `textDocuments` (count + first hash)
- ✅ `structuredData` (count + first hash)

### Excluded from Key (Different Job)
- ❌ `requestId` (internal tracking)
- ❌ `notify` (webhook URL)
- ❌ `async` (execution mode)
- ❌ `mode` (standard/advanced)
- ❌ `clientContext` (execution context)

## Common Scenarios

### Scenario 1: Client Retry on Network Error

```javascript
// Request fails due to network timeout
try {
  await submitResearch({ query: "AI trends" });
} catch (err) {
  // Client retries automatically
  await submitResearch({ query: "AI trends" });
  // ✅ Returns same job, no duplicate created
}
```

### Scenario 2: User Double-Clicks Submit

```javascript
// User clicks submit twice quickly
Promise.all([
  submitResearch({ query: "AI trends" }),
  submitResearch({ query: "AI trends" })
]);
// ✅ Only one job created, both requests return same job_id
```

### Scenario 3: Previous Job Failed, Want to Retry

```javascript
// First attempt failed
const result1 = await submitResearch({ query: "AI trends" });
// → { status: "failed", error: "..." }

// Force retry
const result2 = await submitResearch({
  query: "AI trends",
  force_new: true
});
// → { job_id: "job_new", forced_new: true }
```

### Scenario 4: Want Fresh Results Despite Cache

```javascript
// Results were cached yesterday
const result = await submitResearch({
  query: "Latest AI news",
  force_new: true  // ← Force new research
});
// → { job_id: "job_new", forced_new: true }
```

### Scenario 5: Custom Deduplication Logic

```javascript
// Client wants to dedupe across different queries
const customKey = hashMyBusinessLogic(userId, topic, date);

await submitResearch({
  query: "AI trends in healthcare",
  idempotency_key: customKey
});

// Later, different query but same business context
await submitResearch({
  query: "Healthcare AI developments",
  idempotency_key: customKey  // ← Same key = same job
});
```

## Testing

### Run Tests

```bash
node tests/test-idempotency.js
```

### Manual Testing

```bash
# Terminal 1: Start server
npm start

# Terminal 2: Submit duplicate requests
curl -X POST http://localhost:3002/api/jobs \
  -H "Content-Type: application/json" \
  -d '{"query": "test", "costPreference": "low"}'

curl -X POST http://localhost:3002/api/jobs \
  -H "Content-Type: application/json" \
  -d '{"query": "test", "costPreference": "low"}'

# Should return same job_id
```

## Monitoring

### Check Logs

```bash
# Idempotency events are logged to stderr
tail -f logs/server.log | grep idempotency

# Example output:
# {"timestamp":"...","event":"idempotency_cache_hit","idempotency_key":"abc...","existing_job_id":"job_123"}
```

### Key Metrics to Watch

- **Cache hit rate:** `cache_hit / (cache_hit + cache_miss)`
- **Duplicate rate:** `existing_job / total_submissions`
- **Forced new rate:** `forced_new / total_submissions`
- **Failed retry rate:** `retry_failed / total_failures`

## Troubleshooting

### Problem: Duplicates Still Created

**Check:**
1. Is idempotency enabled? `echo $IDEMPOTENCY_ENABLED`
2. Are params exactly the same? (case-sensitive for most fields)
3. Check logs for `idempotency_cache_miss` events

**Solution:**
- Ensure params are normalized before submission
- Use `idempotency_key` to force deduplication

### Problem: Key Expired, Want to Extend

**Check:**
1. Current TTL: `echo $IDEMPOTENCY_TTL_SECONDS`
2. Job still running? Heartbeat extends TTL automatically

**Solution:**
- Increase TTL: `IDEMPOTENCY_TTL_SECONDS=7200` (2 hours)
- Or let heartbeat extend it automatically

### Problem: Want to Disable for Testing

**Solution:**
```bash
# In .env or terminal
export IDEMPOTENCY_ENABLED=false
npm start
```

### Problem: Race Condition Errors

**Symptom:** Logs show `idempotency_race_condition` events

**Explanation:** This is normal! System handles it automatically via retry.

**Action:** No action needed, system self-corrects.

## Best Practices

### ✅ DO

- **Let idempotency work** - Don't override unless necessary
- **Use force_new sparingly** - Only when you truly need fresh results
- **Monitor cache hit rates** - High = system working well
- **Set appropriate TTL** - Based on your use case (1-3 hours typical)
- **Use custom keys** - When you have specific deduplication logic

### ❌ DON'T

- **Don't disable globally** - Use force_new per-request instead
- **Don't set TTL too low** - < 5 min defeats the purpose
- **Don't set TTL too high** - > 24 hr wastes storage
- **Don't ignore failed retries** - Investigate why jobs are failing
- **Don't bypass for all requests** - Defeats duplicate prevention

## Performance Impact

- **Lookup overhead:** ~1-5ms per submission (negligible)
- **Storage overhead:** ~50 bytes per job (minimal)
- **Duplicate savings:** Eliminates 100% of unnecessary work

**Net result:** Massive savings on duplicate research execution 🎉

## Quick Decision Tree

```
Need to submit research?
  │
  ├─ First time / unique params?
  │  └─ Just submit → System handles idempotency
  │
  ├─ Retrying failed request?
  │  └─ Use force_new: true
  │
  ├─ Want fresh results despite cache?
  │  └─ Use force_new: true
  │
  ├─ Custom deduplication logic?
  │  └─ Use idempotency_key: "custom"
  │
  └─ Normal case?
     └─ Just submit → Let system dedupe
```

## Summary

**Remember:** Idempotency is **ON by default**. It just works™. Only use `force_new: true` when you specifically need to bypass it.

For full details, see:
- **Design:** `docs/IDEMPOTENCY-DESIGN.md`
- **Implementation:** `docs/IDEMPOTENCY-IMPLEMENTATION.md`
- **Tests:** `tests/test-idempotency.js`

---

**Questions?** Check the logs, run the tests, or review the design doc.
