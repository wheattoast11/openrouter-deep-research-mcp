// src/utils/graphManager.js
// Universal Knowledge Graph for entity extraction and relationship mapping

const dbClient = require('./dbClient');
const openRouterClient = require('./openRouterClient');
const config = require('../../config');

class GraphManager {
  constructor() {
    this.extractionModel = config.models.classification; // Reuse classification model for entity extraction
  }

  /**
   * Extract entities from text using LLM
   */
  async extractEntities(text, options = {}) {
    const requestId = options.requestId || 'unknown-req';
    
    const systemPrompt = `Extract key entities from the following text. Return a JSON array of objects with format:
[
  { "name": "Entity Name", "type": "person|organization|concept|technology|location", "description": "Brief description" }
]

Focus on entities that are central to the content. Limit to the top 10 most important entities.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text.slice(0, 8000) } // Limit context
    ];

    try {
      const response = await openRouterClient.chatCompletion(this.extractionModel, messages, {
        temperature: 0.1,
        max_tokens: 1000
      });

      const content = response.choices[0].message.content.trim();
      
      // Try to parse JSON
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const entities = JSON.parse(jsonMatch[0]);
        console.error(`[${new Date().toISOString()}] [${requestId}] GraphManager: Extracted ${entities.length} entities`);
        return entities;
      }
      
      return [];
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [${requestId}] GraphManager: Error extracting entities:`, error);
      return [];
    }
  }

  /**
   * Extract relationships between entities
   */
  async extractRelationships(text, entities, options = {}) {
    const requestId = options.requestId || 'unknown-req';
    
    if (entities.length === 0) return [];

    const entityList = entities.map(e => e.name).join(', ');
    
    const systemPrompt = `Given the following entities: ${entityList}

Identify relationships between these entities based on the provided text. Return a JSON array:
[
  { "source": "Entity1", "target": "Entity2", "type": "is_a|part_of|related_to|uses|implements", "description": "Brief description" }
]

Focus on the most important relationships. Limit to 15 relationships.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text.slice(0, 8000) }
    ];

    try {
      const response = await openRouterClient.chatCompletion(this.extractionModel, messages, {
        temperature: 0.1,
        max_tokens: 1000
      });

      const content = response.choices[0].message.content.trim();
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      
      if (jsonMatch) {
        const relationships = JSON.parse(jsonMatch[0]);
        console.error(`[${new Date().toISOString()}] [${requestId}] GraphManager: Extracted ${relationships.length} relationships`);
        return relationships;
      }
      
      return [];
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [${requestId}] GraphManager: Error extracting relationships:`, error);
      return [];
    }
  }

  /**
   * Add a node to the knowledge graph
   */
  async addNode(name, type, metadata = {}) {
    const embedding = await dbClient.generateEmbedding(name);
    const embeddingFormatted = embedding ? `[${embedding.join(',')}]` : null;

    return dbClient.executeWithRetry(async () => {
      const db = dbClient.getDbInstance();
      const result = await db.query(
        `INSERT INTO graph_nodes (name, type, metadata, embedding, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         ON CONFLICT (name) DO UPDATE 
         SET metadata = EXCLUDED.metadata, 
             embedding = EXCLUDED.embedding,
             updated_at = NOW()
         RETURNING id;`,
        [name, type, JSON.stringify(metadata), embeddingFormatted]
      );
      
      return result.rows[0].id;
    }, 'addNode', null);
  }

  /**
   * Add an edge to the knowledge graph
   */
  async addEdge(sourceNodeId, targetNodeId, relationType, metadata = {}) {
    return dbClient.executeWithRetry(async () => {
      const db = dbClient.getDbInstance();
      const result = await db.query(
        `INSERT INTO graph_edges (source_node_id, target_node_id, relation_type, metadata, created_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (source_node_id, target_node_id, relation_type) DO UPDATE
         SET metadata = EXCLUDED.metadata
         RETURNING id;`,
        [sourceNodeId, targetNodeId, relationType, JSON.stringify(metadata)]
      );
      
      return result.rows[0].id;
    }, 'addEdge', null);
  }

  /**
   * Query the knowledge graph
   */
  async query(entityName, options = {}) {
    const maxHops = options.maxHops || 2;
    const limit = options.limit || 50;

    return dbClient.executeWithRetry(async () => {
      const db = dbClient.getDbInstance();
      
      // Find the node
      const nodeResult = await db.query(
        `SELECT id, name, type, metadata FROM graph_nodes WHERE name ILIKE $1 LIMIT 1;`,
        [entityName]
      );
      
      if (nodeResult.rows.length === 0) {
        return { found: false, entity: entityName };
      }

      const node = nodeResult.rows[0];
      
      // Get related nodes (1-hop)
      const edgesResult = await db.query(
        `SELECT e.id, e.source_node_id, e.target_node_id, e.relation_type, e.metadata,
                s.name AS source_name, s.type AS source_type,
                t.name AS target_name, t.type AS target_type
         FROM graph_edges e
         JOIN graph_nodes s ON s.id = e.source_node_id
         JOIN graph_nodes t ON t.id = e.target_node_id
         WHERE e.source_node_id = $1 OR e.target_node_id = $1
         LIMIT $2;`,
        [node.id, limit]
      );
      
      return {
        found: true,
        entity: {
          id: node.id,
          name: node.name,
          type: node.type,
          metadata: typeof node.metadata === 'string' ? JSON.parse(node.metadata) : node.metadata
        },
        relationships: edgesResult.rows.map(r => ({
          id: r.id,
          source: { name: r.source_name, type: r.source_type },
          target: { name: r.target_name, type: r.target_type },
          relationType: r.relation_type,
          metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata
        }))
      };
    }, 'queryGraph', { found: false, entity: entityName });
  }

  /**
   * Process a research report and extract knowledge graph information
   */
  async processReport(reportId, reportText, originalQuery, options = {}) {
    const requestId = options.requestId || 'unknown-req';
    
    console.error(`[${new Date().toISOString()}] [${requestId}] GraphManager: Processing report ${reportId} for entity extraction...`);

    try {
      // Extract entities
      const entities = await this.extractEntities(reportText, { requestId });
      
      if (entities.length === 0) {
        console.error(`[${new Date().toISOString()}] [${requestId}] GraphManager: No entities extracted from report ${reportId}`);
        return { entities: 0, relationships: 0 };
      }

      // Add entities to graph
      const nodeIds = new Map();
      for (const entity of entities) {
        const nodeId = await this.addNode(entity.name, entity.type, {
          description: entity.description,
          sourceReportId: reportId,
          sourceQuery: originalQuery
        });
        nodeIds.set(entity.name, nodeId);
      }

      // Extract and add relationships
      const relationships = await this.extractRelationships(reportText, entities, { requestId });
      let relationshipCount = 0;
      
      for (const rel of relationships) {
        const sourceId = nodeIds.get(rel.source);
        const targetId = nodeIds.get(rel.target);
        
        if (sourceId && targetId) {
          await this.addEdge(sourceId, targetId, rel.type, {
            description: rel.description,
            sourceReportId: reportId
          });
          relationshipCount++;
        }
      }

      console.error(`[${new Date().toISOString()}] [${requestId}] GraphManager: Processed report ${reportId}: ${entities.length} entities, ${relationshipCount} relationships`);

      return {
        entities: entities.length,
        relationships: relationshipCount
      };
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [${requestId}] GraphManager: Error processing report ${reportId}:`, error);
      return { entities: 0, relationships: 0, error: error.message };
    }
  }

  /**
   * Get all schedules
   */
  getAllSchedules() {
    const schedules = [];
    this.schedules.forEach(schedule => {
      schedules.push({
        id: schedule.id,
        cronExpression: schedule.cronExpression,
        action: schedule.action,
        enabled: schedule.enabled,
        createdAt: schedule.createdAt
      });
    });
    return schedules;
  }
}

module.exports = new GraphManager();

