// src/utils/xmlParser.js
// SignalParser: Isomorphic extraction of protocol-compliant signals from LLM streams.

const { XMLParser } = require('fast-xml-parser');
const { Signal } = require('../core/signal');

/**
 * SignalParser - Transforms LLM XML fragments into Signal objects.
 * Aligned with Agent Zero's multi-agent orchestration pattern.
 */
class SignalParser {
  constructor() {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "",
      textNodeName: "_text",
      parseAttributeValue: true,
      allowBooleanAttributes: true,
      isArray: (name) => name.startsWith('agent_') || name === 'signal'
    });
  }

  /**
   * Parse LLM output into an array of Signals.
   * Handles markdown fences and fragmented XML automatically.
   */
  parseSignals(xmlString, source = 'llm-extraction') {
    let processed = xmlString.trim();

    // Strip markdown fences
    processed = processed.replace(/^```xml\n?/, '').replace(/\n?```$/, '');
    processed = processed.replace(/^```\n?/, '').replace(/\n?```$/, '');

    try {
      // Wrap in root to handle multiple signals/fragments
      const wrapped = `<root>${processed}</root>`;
      const jsonObj = this.parser.parse(wrapped);

      const signals = [];

      if (jsonObj && jsonObj.root) {
        for (const [key, data] of Object.entries(jsonObj.root)) {
          // Handle legacy agent_N tags
          if (key.startsWith('agent_')) {
            const agentId = key.split('_')[1];
            const items = Array.isArray(data) ? data : [data];
            
            items.forEach(item => {
              const content = typeof item === 'object' ? item._text : item;
              if (content) {
                signals.push(Signal.query(content.trim(), `agent-${agentId}`, {
                  tags: ['agent-query', `id-${agentId}`]
                }));
              }
            });
          }

          // Handle new unified <signal> tags
          if (key === 'signal') {
            const items = Array.isArray(data) ? data : [data];
            items.forEach(item => {
              signals.push(new Signal(
                item.type || 'response',
                item._text || item.payload || item,
                {
                  source: item.source || source,
                  confidence: item.confidence ?? 1.0,
                  tags: item.tags ? item.tags.split(',') : []
                }
              ));
            });
          }
        }
      }

      return signals;
    } catch (error) {
      process.stderr.write(`[${new Date().toISOString()}] SignalParser: Parse error: ${error.message}\n`);
      return [];
    }
  }

  /**
   * Static helper for legacy compatibility
   */
  static parseAgentXml(xmlString) {
    const parser = new SignalParser();
    const signals = parser.parseSignals(xmlString);
    
    // If XML parsing succeeded, return mapped results
    if (signals.length > 0) {
      return signals.map(s => ({
        id: parseInt(s.tags.find(t => t.startsWith('id-'))?.split('-')[1] || 0),
        query: typeof s.payload === 'string' ? s.payload : JSON.stringify(s.payload)
      }));
    }
    
    // Fallback: Try to extract queries from non-XML responses (e.g., markdown)
    return SignalParser.extractQueriesFromText(xmlString);
  }

  /**
   * Fallback extraction for when LLM returns markdown/text instead of XML.
   * Attempts to identify research questions or bullet points.
   */
  static extractQueriesFromText(text) {
    const queries = [];
    let id = 1;
    
    // Clean markdown artifacts
    let cleaned = text.trim()
      .replace(/^```[\w]*\n?/gm, '')
      .replace(/\n?```$/gm, '');
    
    // Pattern 1: Numbered lists (1. Question, 2. Question)
    const numberedPattern = /^\s*\d+\.\s*(.+?)(?:\?|$)/gm;
    let match;
    while ((match = numberedPattern.exec(cleaned)) !== null) {
      const query = match[1].trim().replace(/\*\*/g, '');
      if (query.length > 20 && query.length < 500) {
        queries.push({ id: id++, query: query.endsWith('?') ? query : query + '?' });
      }
    }
    
    // Pattern 2: Bullet points (- Question or * Question)
    if (queries.length === 0) {
      const bulletPattern = /^\s*[-*•]\s*(.+?)(?:\?|$)/gm;
      while ((match = bulletPattern.exec(cleaned)) !== null) {
        const query = match[1].trim().replace(/\*\*/g, '');
        if (query.length > 20 && query.length < 500) {
          queries.push({ id: id++, query: query.endsWith('?') ? query : query + '?' });
        }
      }
    }
    
    // Pattern 3: Sentences that look like research questions
    if (queries.length === 0) {
      const questionPattern = /([A-Z][^.!?]*(?:what|how|where|when|why|which|who|can|does|is|are|will)[^.!?]*\?)/gi;
      while ((match = questionPattern.exec(cleaned)) !== null) {
        const query = match[1].trim().replace(/\*\*/g, '');
        if (query.length > 20 && query.length < 500 && !queries.some(q => q.query === query)) {
          queries.push({ id: id++, query });
        }
      }
    }
    
    // Pattern 4: Last resort - split by sentences and take first 5 meaningful ones
    if (queries.length === 0) {
      const sentences = cleaned.split(/[.!?]+/).filter(s => s.trim().length > 30);
      for (const sentence of sentences.slice(0, 5)) {
        const query = sentence.trim().replace(/\*\*/g, '').replace(/^\s*[-*•\d.]+\s*/, '');
        if (query.length > 20) {
          queries.push({ id: id++, query: query + '?' });
        }
      }
    }
    
    // Limit to 5 queries max to prevent explosion
    return queries.slice(0, 5);
  }
}

module.exports = {
  SignalParser,
  parseAgentXml: SignalParser.parseAgentXml
};
