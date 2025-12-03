// scripts/gen-docs.js
const fs = require('fs');
const path = require('path');

function readReport(idx) {
  const p = path.resolve(`research_outputs/research-report-${idx}.md`);
  if (!fs.existsSync(p)) return null;
  const text = fs.readFileSync(p, 'utf8');
  const title = (text.match(/^#\s+(.+)$/m) || [null, `Report ${idx}`])[1];
  const snippet = text.slice(0, 600).replace(/\s+/g, ' ').trim();
  return { idx, title, snippet };
}

function updateReadme(summaries) {
  const readmePath = path.resolve('README.md');
  let readme = fs.readFileSync(readmePath, 'utf8');
  const marker = '\n## Example Research Outputs (Auto-Generated)\n';
  const section = [
    marker,
    ...summaries.map(s => `- **Report ${s.idx}**: ${s.title} — ${s.snippet.slice(0, 220)}...`),
    ''
  ].join('\n');
  if (readme.includes(marker)) {
    readme = readme.replace(new RegExp(`${marker}[\s\S]*$`), section);
  } else {
    readme += '\n' + section;
  }
  fs.writeFileSync(readmePath, readme, 'utf8');
}

function updateChangelog() {
  const changelogPath = path.resolve('docs/CHANGELOG.md');
  let log = fs.readFileSync(changelogPath, 'utf8');
  if (!/## v1\.1\.1/.test(log)) {
    const entry = `\n## v1.1.1 — 2025-08-09\n\n- OAuth2/JWT auth scaffolding for MCP HTTP transport; cors + exposed Mcp-Session-Id\n- Streamable HTTP skeleton with DNS rebinding protection\n- 2025 model prioritization (Qwen3, Gemini 2.5, Grok-4, GPT-5) in dynamic catalog\n- Kurtosis-guided ensembles (2-3 models) with multimodal fallbacks\n- PGlite improvements: adaptive thresholds, keyword fallback, HNSW params (m=16, ef=64)\n- AIMD concurrency controller hooks in planning agent; hybrid batching in OpenRouter client\n- gen-docs script to embed report summaries into README\n`;
    log += entry;
    fs.writeFileSync(changelogPath, log, 'utf8');
  }
}

function main() {
  const summaries = [];
  for (let i = 1; i <= 7; i++) {
    const r = readReport(i);
    if (r) summaries.push(r);
  }
  if (summaries.length > 0) updateReadme(summaries);
  updateChangelog();
  console.log(`Updated README and CHANGELOG with ${summaries.length} report summaries.`);
}

if (require.main === module) main();
