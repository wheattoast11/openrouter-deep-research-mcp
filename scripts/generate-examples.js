// scripts/generate-examples.js
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const tools = require('../src/server/tools');

async function safeFetchUrl(url, maxBytes = 200000) {
  try {
    const res = await tools.fetchUrl({ url, maxBytes });
    const obj = JSON.parse(res);
    const name = obj.title ? `${obj.title} (${url})` : url;
    const content = obj.textSnippet || obj.snippet || obj.text || JSON.stringify(obj).slice(0, 2000);
    return { name, content };
  } catch (e) {
    console.error('fetchUrl failed for', url, e.message);
    return null;
  }
}

async function prepareDocs(urls) {
  const docs = [];
  for (const u of urls) {
    const doc = await safeFetchUrl(u);
    if (doc) docs.push(doc);
  }
  return docs;
}

function extractReportIdAndPath(text) {
  // Expect: "Report ID: <id>. Full report saved to: <path>."
  const idMatch = text.match(/Report ID: ([^.\s]+)/);
  const pathMatch = text.match(/Full report saved to: ([^\n\[]+)/);
  return { id: idMatch ? idMatch[1] : null, savedPath: pathMatch ? pathMatch[1].trim() : null };
}

async function generateAll() {
  const examples = [
    {
      name: 'MCP status (July 2025) — grounded',
      query: 'Executive briefing on Model Context Protocol status and adoption as of July 2025. Focus on origins, JSON-RPC transport, tools/resources/prompts, stdio vs HTTP(SSE), and key ecosystem links. Avoid speculation; cite primary sources.',
      costPreference: 'low',
      urls: [
        'https://github.com/modelcontextprotocol/specification',
        'https://www.jsonrpc.org/specification',
        'https://www.anthropic.com/news/model-context-protocol'
      ]
    },
    {
      name: 'MCP architecture deep-dive',
      query: 'Technical deep-dive into MCP architecture: message schema, JSON-RPC usage, tool invocation, resources, prompts, transports (stdio, streamable HTTP/SSE). Include example flows and cite spec.',
      costPreference: 'low',
      urls: [
        'https://github.com/modelcontextprotocol/specification',
        'https://www.jsonrpc.org/specification'
      ]
    },
    {
      name: 'OpenRouter usage in research agents',
      query: 'How to use OpenRouter chat completions and streaming for research orchestration. Include model discovery, streaming parsing, and auth headers. Cite OpenRouter docs.',
      costPreference: 'low',
      urls: [
        'https://openrouter.ai/docs'
      ]
    },
    {
      name: 'Local KB with PGlite + pgvector',
      query: 'Guide to building a local knowledge base for research agents using PGlite with pgvector: schema, vector index, cosine similarity, and fallbacks. Include code-level considerations. Cite docs.',
      costPreference: 'low',
      urls: [
        'https://electric-sql.com/docs/pglite',
        'https://github.com/pgvector/pgvector'
      ]
    },
    {
      name: 'Parallel orchestration patterns',
      query: 'Best practices for bounded parallelism in multi-agent research: planning, fan-out, rate-limit friendly batching, ensemble comparison, and synthesis with citations.',
      costPreference: 'low',
      urls: []
    },
    {
      name: 'Vision-capable model handling',
      query: 'Design for routing to vision-capable models for image-conditioned research; include model detection via dynamic catalog and graceful degradation if not supported. Cite official model capability pages where possible.',
      costPreference: 'low',
      urls: [
        'https://openrouter.ai/docs'
      ]
    },
    {
      name: 'HTTP/SSE per-connection auth',
      query: 'Patterns for per-connection API-key auth with MCP HTTP/SSE transport; security considerations and error reporting. Include practical examples and references.',
      costPreference: 'low',
      urls: []
    }
  ];

  const outputsDir = path.resolve('research_outputs');
  fs.mkdirSync(outputsDir, { recursive: true });

  const summary = [];

  // Sample outputs from other tools
  const others = {};
  try { others.db_health = await tools.dbHealth({}); } catch (e) { others.db_health = `error: ${e.message}`; }
  try { others.web_search_mcp = await tools.searchWeb({ query: 'Model Context Protocol', maxResults: 5 }); } catch (e) { others.web_search_mcp = `error: ${e.message}`; }
  try { others.fetch_spec = await tools.fetchUrl({ url: 'https://github.com/modelcontextprotocol/specification', maxBytes: 200000 }); } catch (e) { others.fetch_spec = `error: ${e.message}`; }
  try { fs.writeFileSync(path.join(outputsDir, 'sample-db-health.json'), others.db_health); } catch {}
  try { fs.writeFileSync(path.join(outputsDir, 'sample-web-search-mcp.json'), others.web_search_mcp); } catch {}
  try { fs.writeFileSync(path.join(outputsDir, 'sample-fetch-spec.json'), others.fetch_spec); } catch {}

  for (let i = 0; i < examples.length; i++) {
    const ex = examples[i];
    console.log(`\n[${i + 1}/7] Generating: ${ex.name}`);

    // Prepare grounding documents
    const textDocuments = await prepareDocs(ex.urls);

    try {
      const resultMsg = await tools.conductResearch({
        query: ex.query,
        costPreference: ex.costPreference,
        audienceLevel: 'intermediate',
        outputFormat: 'report',
        includeSources: true,
        textDocuments
      });

      const { id, savedPath } = extractReportIdAndPath(resultMsg || '');
      const fixedName = path.join(outputsDir, `research-report-${i + 1}.md`);

      let sourcePath = savedPath && savedPath !== 'Not saved' ? savedPath : null;
      if (sourcePath && fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, fixedName);
      } else {
        // If the pipeline didn’t write a file, try retrieving via getReportContent
        if (id) {
          const content = await tools.getReportContent({ reportId: id });
          fs.writeFileSync(fixedName, content, 'utf8');
        } else {
          // As a last resort, write the message (likely an error)
          fs.writeFileSync(fixedName, `Report generation message for "${ex.name}":\n\n${resultMsg}`, 'utf8');
        }
      }

      // Validate citations lightly
      let content = '';
      try { content = fs.readFileSync(fixedName, 'utf8'); } catch {}
      const citationCount = (content.match(/\[Source:/g) || []).length;
      const ok = citationCount >= 2; // simple threshold

      summary.push({ idx: i + 1, name: ex.name, reportId: id, savedPath, fixedName, citations: citationCount, ok });
      console.log(`Saved ${fixedName} (citations: ${citationCount}${ok ? '' : ' – LOW'})`);
    } catch (e) {
      console.error(`Failed example ${i + 1}:`, e.message);
      const fixedName = path.join(outputsDir, `research-report-${i + 1}.md`);
      fs.writeFileSync(fixedName, `Error generating report: ${e.message}`);
      summary.push({ idx: i + 1, name: ex.name, error: e.message });
    }
  }

  // Print concise summary
  console.log('\n=== Example Report Generation Summary ===');
  for (const s of summary) {
    if (s.error) {
      console.log(`#${s.idx} ${s.name}: ERROR ${s.error}`);
    } else {
      console.log(`#${s.idx} ${s.name}: id=${s.reportId || 'n/a'}, citations=${s.citations}, file=${path.basename(s.fixedName)}`);
    }
  }
  console.log('Sample outputs written: sample-db-health.json, sample-web-search-mcp.json, sample-fetch-spec.json');
}

if (require.main === module) {
  generateAll().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
