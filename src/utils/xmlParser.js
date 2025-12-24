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
    return parser.parseSignals(xmlString).map(s => ({
      id: parseInt(s.tags.find(t => t.startsWith('id-'))?.split('-')[1] || 0),
      query: typeof s.payload === 'string' ? s.payload : JSON.stringify(s.payload)
    }));
  }
}

module.exports = {
  SignalParser,
  parseAgentXml: SignalParser.parseAgentXml
};
