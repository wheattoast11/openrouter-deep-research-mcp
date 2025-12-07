/**
 * Local Knowledge Base
 *
 * Contains verified facts about this system and its dependencies.
 * Used to inject accurate context into research agents to prevent
 * hallucinations about our own technology stack.
 *
 * @module localKnowledge
 * @version 1.8.0
 */

'use strict';

/**
 * Verified facts about the system and its dependencies.
 * Each entry has:
 * - keywords: Array of keywords that trigger this knowledge
 * - facts: Array of verified statements
 * - sources: References for verification
 */
const LOCAL_KNOWLEDGE = [
  {
    id: 'pglite-pgvector',
    keywords: ['pglite', 'pgvector', 'electric-sql', 'wasm', 'postgres', 'vector', 'embedding'],
    facts: [
      'PGlite (from Electric SQL) FULLY SUPPORTS pgvector as a core extension bundled in the package.',
      'PGlite runs PostgreSQL entirely in WebAssembly/WASM and includes pgvector for vector similarity search.',
      'The @electric-sql/pglite package includes built-in extensions: pgvector, pg_trgm, fuzzystrmatch, and more.',
      'This codebase (@terminals-tech/openrouter-agents) uses PGlite with pgvector for semantic search and embeddings storage.',
      'PGlite pgvector supports: vector type, cosine distance (<=>), L2 distance (<->), and inner product (<#>).',
      'There are NO WASM limitations preventing pgvector support in PGlite - it is fully functional.'
    ],
    sources: [
      'https://pglite.dev/extensions/#pgvector',
      'https://github.com/electric-sql/pglite',
      'package.json: "@electric-sql/pglite": "^0.2.17"'
    ]
  },
  {
    id: 'pglite-extensions',
    keywords: ['pglite', 'extension', 'pg_trgm', 'fuzzystrmatch', 'trigram'],
    facts: [
      'PGlite includes pg_trgm extension for trigram-based text similarity and search.',
      'PGlite includes fuzzystrmatch extension for phonetic matching (soundex, metaphone, levenshtein).',
      'Extensions in PGlite are loaded via: CREATE EXTENSION IF NOT EXISTS <extension_name>;',
      'All bundled PGlite extensions work in WASM without additional installation.'
    ],
    sources: [
      'https://pglite.dev/extensions/',
      'src/utils/dbClient.js'
    ]
  },
  {
    id: 'terminals-tech-stack',
    keywords: ['terminals.tech', 'openrouter-agents', 'mcp', 'architecture'],
    facts: [
      'OpenRouter Agents is an MCP (Model Context Protocol) server for AI research workflows.',
      'The system uses PGlite for local persistent storage with vector search capabilities.',
      'Research is conducted using multiple LLM models via OpenRouter API.',
      'The stack includes: Node.js, Express, PGlite, pgvector, and MCP SDK.',
      'Embeddings are generated using @terminals-tech/embeddings package.',
      'Knowledge graph operations use @terminals-tech/graph package.'
    ],
    sources: [
      'package.json',
      'CLAUDE.md'
    ]
  },
  {
    id: 'mcp-protocol',
    keywords: ['mcp', 'model context protocol', 'anthropic', 'claude'],
    facts: [
      'MCP (Model Context Protocol) is an open protocol for LLM-tool integration.',
      'MCP supports multiple transports: stdio, HTTP+SSE, and WebSocket.',
      'This server implements MCP 2025-06-18 specification with Task Protocol (SEP-1686).',
      'MCP tools are invoked via JSON-RPC 2.0 messages.',
      'The server supports sampling (SEP-1577) and elicitation (SEP-1036) protocols.'
    ],
    sources: [
      'https://spec.modelcontextprotocol.io/',
      'docs/MCP-COMPLIANCE-REPORT.md'
    ]
  },
  {
    id: 'openrouter-api',
    keywords: ['openrouter', 'api', 'model', 'llm'],
    facts: [
      'OpenRouter provides unified API access to multiple LLM providers.',
      'This system uses OpenRouter for research agent LLM calls.',
      'Models are selected based on costPreference: "high" or "low".',
      'High-cost models include: GPT-5, Claude Sonnet 4, Gemini 2.5 Pro.',
      'Low-cost models include: DeepSeek, GPT-5-mini, Gemini 2.5 Flash.'
    ],
    sources: [
      'https://openrouter.ai/docs',
      'config.js'
    ]
  }
];

/**
 * Find relevant local knowledge based on query keywords
 * @param {string} query - The research query
 * @returns {Array<Object>} Matching knowledge entries with facts
 */
function findRelevantKnowledge(query) {
  if (!query || typeof query !== 'string') return [];

  const queryLower = query.toLowerCase();
  const matches = [];

  for (const entry of LOCAL_KNOWLEDGE) {
    // Check if any keyword matches
    const matchingKeywords = entry.keywords.filter(kw =>
      queryLower.includes(kw.toLowerCase())
    );

    if (matchingKeywords.length > 0) {
      matches.push({
        id: entry.id,
        matchedKeywords: matchingKeywords,
        matchScore: matchingKeywords.length / entry.keywords.length,
        facts: entry.facts,
        sources: entry.sources
      });
    }
  }

  // Sort by match score (more keywords matched = higher priority)
  matches.sort((a, b) => b.matchScore - a.matchScore);

  return matches;
}

/**
 * Format relevant knowledge for injection into prompts
 * @param {string} query - The research query
 * @returns {string} Formatted knowledge context or empty string
 */
function getKnowledgeContext(query) {
  const matches = findRelevantKnowledge(query);

  if (matches.length === 0) return '';

  const sections = matches.map(m => {
    const factsText = m.facts.map(f => `  - ${f}`).join('\n');
    const sourcesText = m.sources.map(s => `  - ${s}`).join('\n');
    return `[${m.id}] (matched: ${m.matchedKeywords.join(', ')})\nFACTS:\n${factsText}\nSOURCES:\n${sourcesText}`;
  });

  return `
=== VERIFIED LOCAL KNOWLEDGE ===
The following facts are VERIFIED and MUST be respected in your research.
Do NOT contradict these facts - they are ground truth about the system.

${sections.join('\n\n')}

=== END VERIFIED LOCAL KNOWLEDGE ===
`;
}

/**
 * Check if a claim contradicts local knowledge
 * @param {string} claim - A claim to verify
 * @returns {Object|null} Contradiction details or null if no contradiction
 */
function checkContradiction(claim) {
  if (!claim || typeof claim !== 'string') return null;

  const claimLower = claim.toLowerCase();

  // Known false patterns
  const falsePatterns = [
    {
      pattern: /pglite.*(cannot|doesn't|does not|unable|not.*(support|compatible)).*(pgvector|vector)/i,
      knowledgeId: 'pglite-pgvector',
      contradiction: 'PGlite DOES support pgvector as a core bundled extension.'
    },
    {
      pattern: /wasm.*(limitation|restrict|prevent).*(pgvector|vector)/i,
      knowledgeId: 'pglite-pgvector',
      contradiction: 'There are no WASM limitations preventing pgvector in PGlite.'
    },
    {
      pattern: /pgvector.*(not.*available|unavailable).*(pglite|wasm)/i,
      knowledgeId: 'pglite-pgvector',
      contradiction: 'pgvector IS available in PGlite via bundled extension.'
    }
  ];

  for (const fp of falsePatterns) {
    if (fp.pattern.test(claim)) {
      const knowledge = LOCAL_KNOWLEDGE.find(k => k.id === fp.knowledgeId);
      return {
        claim,
        contradiction: fp.contradiction,
        correctFacts: knowledge?.facts || [],
        sources: knowledge?.sources || []
      };
    }
  }

  return null;
}

module.exports = {
  LOCAL_KNOWLEDGE,
  findRelevantKnowledge,
  getKnowledgeContext,
  checkContradiction
};
