#!/usr/bin/env node
/**
 * Ensures TOOL_CATALOG tool names are registered in mcpServer.js (static audit).
 * Run: node scripts/tool-registry-audit.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const mcpPath = path.join(root, 'src/server/mcpServer.js');
const toolsPath = path.join(root, 'src/server/tools.js');

const mcpSrc = fs.readFileSync(mcpPath, 'utf8');
const toolsSrc = fs.readFileSync(toolsPath, 'utf8');

const registerNames = new Set();
const regRe = /register\(\s*["']([^"']+)["']/g;
let m;
while ((m = regRe.exec(mcpSrc)) !== null) {
  registerNames.add(m[1]);
}

const catalogMatch = toolsSrc.match(/const TOOL_CATALOG = \[([\s\S]*?)\n\];/);
if (!catalogMatch) {
  console.error('Could not parse TOOL_CATALOG');
  process.exit(1);
}

const catRe = /name:\s*['"]([^'"]+)['"]/g;
const catalogNames = [];
while ((m = catRe.exec(catalogMatch[1])) !== null) {
  catalogNames.push(m[1]);
}

const missing = catalogNames.filter((n) => !registerNames.has(n));
if (missing.length) {
  console.error('TOOL_CATALOG entries missing register() in mcpServer.js:', missing.join(', '));
  process.exit(1);
}

console.log('tool-registry-audit: ok', { catalogEntries: catalogNames.length, registers: registerNames.size });
