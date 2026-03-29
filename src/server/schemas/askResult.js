/**
 * v3 stable JSON envelope for the `ask` tool (Zod v4).
 * Host models should parse this shape instead of ad-hoc prose.
 */
const { z } = require('zod');

const CitationSchema = z.object({
  title: z.string().optional(),
  url: z.string().optional(),
  snippet: z.string().optional()
});

const AskResultSchema = z
  .object({
    answer: z.string().describe('Primary response text for the user'),
    citations: z.array(CitationSchema).optional().default([]),
    reportId: z.string().nullable().optional(),
    jobId: z.string().nullable().optional(),
    sessionId: z.string().optional(),
    sync: z.boolean().optional(),
    trace: z.array(z.string()).optional(),
    warnings: z.array(z.string()).optional().default([]),
    next: z
      .string()
      .optional()
      .describe('When async, hint such as poll job_get')
  })
  .strict();

/**
 * @param {unknown} data
 * @returns {z.infer<typeof AskResultSchema>}
 */
function parseAskResult(data) {
  return AskResultSchema.parse(data);
}

/**
 * @param {unknown} data
 * @returns {{ ok: true; data: z.infer<typeof AskResultSchema> } | { ok: false; error: string }}
 */
function safeParseAskResult(data) {
  const r = AskResultSchema.safeParse(data);
  if (!r.success) {
    return { ok: false, error: r.error.message };
  }
  return { ok: true, data: r.data };
}

module.exports = {
  AskResultSchema,
  CitationSchema,
  parseAskResult,
  safeParseAskResult
};
