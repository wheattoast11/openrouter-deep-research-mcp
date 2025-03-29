// src/utils/xmlParser.js
const { XMLParser } = require('fast-xml-parser');

function parseAgentXml(xmlString) {
  const options = {
    ignoreAttributes: false,
    attributeNamePrefix: "",
    textNodeName: "_text",
    parseAttributeValue: true,
    allowBooleanAttributes: true,
    // Ensure array notation is used even for single elements
    isArray: (name, jpath, isLeafNode, isAttribute) => {
      // Treat all agent tags as arrays
      return name.startsWith('agent_');
    }
  };

  const parser = new XMLParser(options);
  let agents = [];

  try {
    // Wrap the potentially fragmented XML in a root element for safer parsing
    const wrappedXml = `<root>${xmlString}</root>`;
    const jsonObj = parser.parse(wrappedXml);

    if (jsonObj && jsonObj.root) {
      // Iterate through potential agent tags
      for (const key in jsonObj.root) {
        if (key.startsWith('agent_')) {
          const agentIdMatch = key.match(/agent_(\d+)/);
          if (agentIdMatch) {
            const agentId = parseInt(agentIdMatch[1]);
            const agentData = jsonObj.root[key];
            
            // Handle cases where there might be multiple tags with the same name
            const items = Array.isArray(agentData) ? agentData : [agentData];
            
            items.forEach(item => {
              if (item && typeof item === 'object' && item._text) {
                agents.push({
                  id: agentId, // Use the ID from the tag name
                  query: item._text.trim()
                });
              } else if (typeof item === 'string') { // Handle case where content is just text
                 agents.push({
                  id: agentId,
                  query: item.trim()
                });
              }
            });
          }
        }
      }
      // Sort by ID just in case the order wasn't guaranteed
      agents.sort((a, b) => a.id - b.id);
    } else {
       console.error(`[${new Date().toISOString()}] xmlParser: Failed to parse XML structure. Input:`, xmlString);
    }

  } catch (error) {
    console.error(`[${new Date().toISOString()}] xmlParser: Error parsing XML string. Input:`, xmlString, 'Error:', error);
    // Return empty array or rethrow, depending on desired error handling
    // Returning empty array to avoid breaking the flow, but logging the error
  }

  if (agents.length === 0) {
     console.warn(`[${new Date().toISOString()}] xmlParser: No agent queries extracted from XML. Input:`, xmlString);
  }

  return agents;
}

module.exports = {
  parseAgentXml
};
