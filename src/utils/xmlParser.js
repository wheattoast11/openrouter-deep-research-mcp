// src/utils/xmlParser.js
function parseAgentXml(xmlString) {
  const agentRegex = /<agent_(\d+)>(.*?)<\/agent_\1>/gs;
  const agents = [];
  
  let match;
  while ((match = agentRegex.exec(xmlString)) !== null) {
    agents.push({
      id: parseInt(match[1]),
      query: match[2].trim()
    });
  }
  
  return agents;
}

module.exports = {
  parseAgentXml
};