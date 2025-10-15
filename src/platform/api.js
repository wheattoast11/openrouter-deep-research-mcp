// Minimal App Platform API v0 (graphs, runs, events)
const express = require('express');
const { z } = require('zod');
const db = require('../utils/dbClient');

const router = express.Router();

const GraphNode = z.object({ id: z.string(), tag: z.string(), params: z.record(z.any()).optional() });
const GraphEdge = z.object({ from: z.string(), to: z.string(), via: z.string().optional() });
const Graph = z.object({ id: z.string().optional(), nodes: z.array(GraphNode), edges: z.array(GraphEdge) });

router.post('/graphs', async (req, res) => {
  try {
    const parsed = Graph.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid graph', issues: parsed.error.issues });
    }
    const graphId = await db.upsertPlatformGraph(parsed.data.id, parsed.data);
    const stored = await db.getPlatformGraph(graphId);
    return res.json(stored);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.get('/graphs/:id', async (req, res) => {
  try {
    const g = await db.getPlatformGraph(req.params.id);
    if (!g) return res.status(404).json({ error: 'Not found' });
    return res.json(g);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

const RunRequest = z.object({ graph_id: z.string(), params: z.record(z.any()).optional() });

router.post('/runs', async (req, res) => {
  try {
    const parsed = RunRequest.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid run', issues: parsed.error.issues });
    const runId = await db.createPlatformRun(parsed.data.graph_id, parsed.data.params || {});
    return res.json({
      run_id: runId,
      resources: [
        { rel: 'events', href: `/platform/runs/${runId}/events`, type: 'application/json' },
        { rel: 'events-stream', href: `/platform/runs/${runId}/events/stream`, type: 'text/event-stream' }
      ]
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.get('/runs/:id', async (req, res) => {
  try {
    const r = await db.getPlatformRun(req.params.id);
    if (!r) return res.status(404).json({ error: 'Not found' });
    return res.json(r);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.get('/runs/:id/events', async (req, res) => {
  try {
    const since = req.query.since_id ? Number(req.query.since_id) : 0;
    const evs = await db.listPlatformEvents(req.params.id, since, 200);
    return res.json({ events: evs });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Server-Sent Events stream for platform run events
router.get('/runs/:id/events/stream', async (req, res) => {
  const runId = req.params.id;
  const sinceHeader = req.headers['last-event-id'] || req.query.since_event_id || 0;
  const includeMeta = String(req.query.meta || 'true').toLowerCase() !== 'false';

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  let lastEventId = Number(sinceHeader) || 0;

  function buildMeta(ev, run) {
    if (!includeMeta) return undefined;
    try {
      const params = (run && typeof run.params === 'object') ? run.params : {};
      return {
        seed_used: params.seed || null,
        determinism: params.determinism || 'best_effort',
        resource_used: {
          device: (params.resource_hints && params.resource_hints.device) || (process.env.LOCAL_INFERENCE_DEVICE || 'webgpu'),
          max_context: (params.resource_hints && params.resource_hints.max_context) || null,
          rope_scale: (params.resource_hints && params.resource_hints.rope_scale) || null
        },
        event_id: ev && ev.id || null,
        phase: ev && ev.phase || null
      };
    } catch (_) {
      return undefined;
    }
  }
  const send = (type, data) => {
    try {
      if (data && typeof data === 'object' && data.id) {
        res.write(`id: ${data.id}\n`);
      }
      res.write(`event: ${type}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (_) {}
  };

  send('open', { ok: true, run_id: runId });

  const timer = setInterval(async () => {
    try {
      const run = await db.getPlatformRun(runId);
      const events = await db.listPlatformEvents(runId, lastEventId, 200);
      for (const ev of events) {
        lastEventId = ev.id;
        const eventType = ev.event_type || 'message';
        const enriched = includeMeta ? { ...ev, meta: buildMeta(ev, run) } : ev;
        send(eventType, enriched);
      }

      if (!run || ['succeeded', 'failed', 'canceled', 'cancelled'].includes(String(run.status || '').toLowerCase())) {
        const finalPayload = includeMeta ? { ...(run || { run_id: runId, status: 'unknown' }), meta: buildMeta({ id: lastEventId, phase: 'complete' }, run) } : (run || { run_id: runId, status: 'unknown' });
        send('complete', finalPayload);
        clearInterval(timer);
        if (!res.writableEnded) res.end();
      }
    } catch (e) {
      send('error', { message: e.message });
    }
  }, 1000);

  req.on('close', () => { clearInterval(timer); });
});

module.exports = { router };


