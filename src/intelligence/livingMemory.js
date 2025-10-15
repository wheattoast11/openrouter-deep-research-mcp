/**
 * Living Memory - Self-Improving Knowledge Graph
 * 
 * Not a static database. A continuously learning neural memory.
 * Extracts entities, detects patterns, resolves contradictions.
 * Grows smarter with every query.
 * 
 * @module intelligence/livingMemory
 */

const dbClient = require('../utils/dbClient');

class LivingMemory {
  constructor(options = {}) {
    this.vectorDimension = options.vectorDimension || 768;
    this.graphDepth = options.graphDepth || 2;
    this.confidenceDecay = options.confidenceDecay || 0.95; // Per day
    this.initialized = false;
  }
  
  /**
   * Initialize the living memory system
   */
  async initialize() {
    if (this.initialized) return;
    
    // Ensure tables exist
    await this.ensureSchema();
    
    // Load cognitive patterns
    await this.loadPatterns();
    
    this.initialized = true;
  }
  
  /**
   * Ensure knowledge graph schema exists
   */
  async ensureSchema() {
    // Entities table
    await dbClient.executeQuery(`
      CREATE TABLE IF NOT EXISTS kg_entities (
        entity_id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        name TEXT NOT NULL,
        properties JSONB DEFAULT '{}',
        embedding VECTOR(${this.vectorDimension}),
        confidence REAL DEFAULT 0.5,
        source_count INTEGER DEFAULT 1,
        first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `, []);
    
    // Relations table
    await dbClient.executeQuery(`
      CREATE TABLE IF NOT EXISTS kg_relations (
        relation_id TEXT PRIMARY KEY,
        source_entity TEXT NOT NULL,
        target_entity TEXT NOT NULL,
        relation_type TEXT NOT NULL,
        properties JSONB DEFAULT '{}',
        confidence REAL DEFAULT 0.5,
        source_count INTEGER DEFAULT 1,
        first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (source_entity) REFERENCES kg_entities(entity_id),
        FOREIGN KEY (target_entity) REFERENCES kg_entities(entity_id)
      )
    `, []);
    
    // Contradictions table
    await dbClient.executeQuery(`
      CREATE TABLE IF NOT EXISTS kg_contradictions (
        contradiction_id TEXT PRIMARY KEY,
        entity_id TEXT NOT NULL,
        claim_a TEXT NOT NULL,
        claim_b TEXT NOT NULL,
        detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        resolved BOOLEAN DEFAULT FALSE,
        resolution TEXT,
        FOREIGN KEY (entity_id) REFERENCES kg_entities(entity_id)
      )
    `, []);
    
    // Cognitive patterns table (meta-learning)
    await dbClient.executeQuery(`
      CREATE TABLE IF NOT EXISTS kg_patterns (
        pattern_id TEXT PRIMARY KEY,
        pattern_type TEXT NOT NULL,
        description TEXT,
        confidence REAL DEFAULT 0.5,
        observation_count INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_observed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        pattern_data JSONB
      )
    `, []);
    
    // User cognitive fingerprints
    await dbClient.executeQuery(`
      CREATE TABLE IF NOT EXISTS kg_user_profiles (
        user_id TEXT PRIMARY KEY,
        cognitive_embedding VECTOR(${this.vectorDimension}),
        preferences JSONB DEFAULT '{}',
        query_count INTEGER DEFAULT 0,
        avg_complexity REAL DEFAULT 0.5,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `, []);
  }
  
  /**
   * Query memory for relevant past research
   * 
   * @param {Object} intent - Parsed query intent
   * @param {Object} context - User context
   * @returns {Promise<MemoryResult>}
   */
  async query(intent, context = {}) {
    await this.initialize();
    
    const queryEmbedding = intent.embedding || await dbClient.generateEmbedding(intent.query);
    
    // 1. Vector search for similar past research
    const similarReports = await dbClient.findReportsBySimilarity(queryEmbedding, 10);
    
    // 2. Find relevant entities
    const entities = await this.findRelevantEntities(queryEmbedding, 20);
    
    // 3. Graph traversal from those entities
    const graph = await this.traverseGraph(entities, this.graphDepth);
    
    // 4. Check for high-confidence cached answer
    const cachedAnswer = await this.getCachedAnswer(intent, similarReports);
    
    // 5. Load user's cognitive profile
    const userProfile = context.userId 
      ? await this.getUserProfile(context.userId)
      : null;
    
    return {
      results: similarReports,
      entities: entities,
      graph: graph,
      cachedAnswer: cachedAnswer,
      confidence: cachedAnswer ? cachedAnswer.confidence : 0,
      userProfile: userProfile
    };
  }
  
  /**
   * Learn from new research insights
   * 
   * @param {Object} intent - Original query intent
   * @param {Array<Insight>} insights - Research results
   * @param {Object} context - Execution context
   * @param {Object} memory - Previous memory state
   */
  async learn(intent, insights, context, memory) {
    await this.initialize();
    
    // 1. Extract entities from insights
    const entities = await this.extractEntities(insights);
    
    // 2. Extract relationships
    const relations = await this.extractRelations(insights, entities);
    
    // 3. Update or create entities in graph
    for (const entity of entities) {
      await this.upsertEntity(entity);
    }
    
    // 4. Update or create relations
    for (const relation of relations) {
      await this.upsertRelation(relation);
    }
    
    // 5. Detect contradictions
    const contradictions = await this.detectContradictions(entities);
    for (const contradiction of contradictions) {
      await this.recordContradiction(contradiction);
    }
    
    // 6. Update user cognitive profile
    if (context.userId) {
      await this.updateUserProfile(context.userId, intent, insights);
    }
    
    // 7. Update pattern library (meta-learning)
    await this.updatePatterns(intent, insights, memory);
  }
  
  /**
   * Extract entities from research insights
   */
  async extractEntities(insights) {
    const entities = [];
    
    for (const insight of insights) {
      const text = insight.content || insight.text || '';
      
      // Simple entity extraction (can be enhanced with NER model)
      // Extract capitalized phrases, technical terms, URLs
      const patterns = [
        /([A-Z][a-z]+(?: [A-Z][a-z]+){0,3})/g, // Proper nouns
        /([A-Z]{2,}[0-9]*)/g, // Acronyms
        /(https?:\/\/[^\s]+)/g, // URLs
        /([a-z]+(?:[A-Z][a-z]+)+)/g // camelCase terms
      ];
      
      const matches = new Set();
      for (const pattern of patterns) {
        const found = text.match(pattern) || [];
        found.forEach(m => matches.add(m));
      }
      
      for (const match of matches) {
        entities.push({
          name: match,
          type: this.classifyEntityType(match),
          context: text.substring(
            Math.max(0, text.indexOf(match) - 100),
            Math.min(text.length, text.indexOf(match) + 100)
          ),
          confidence: insight.confidence || 0.7,
          source: insight.source || 'unknown'
        });
      }
    }
    
    return entities;
  }
  
  /**
   * Classify entity type (simple heuristic)
   */
  classifyEntityType(text) {
    if (/^https?:\/\//.test(text)) return 'url';
    if (/^[A-Z]{2,}[0-9]*$/.test(text)) return 'acronym';
    if (/[A-Z][a-z]+(?:[A-Z][a-z]+)+/.test(text)) return 'technical_term';
    if (/^[A-Z][a-z]+(?: [A-Z][a-z]+)+$/.test(text)) return 'proper_noun';
    return 'term';
  }
  
  /**
   * Extract relationships between entities
   */
  async extractRelations(insights, entities) {
    const relations = [];
    
    // Simple co-occurrence based relations
    // Enhanced version would use dependency parsing
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const e1 = entities[i];
        const e2 = entities[j];
        
        // If both appear in same insight context, they're related
        if (e1.context.includes(e2.name) || e2.context.includes(e1.name)) {
          relations.push({
            source: e1.name,
            target: e2.name,
            type: 'mentioned_with',
            confidence: Math.min(e1.confidence, e2.confidence),
            context: e1.context
          });
        }
      }
    }
    
    return relations;
  }
  
  /**
   * Upsert entity with confidence merging
   */
  async upsertEntity(entity) {
    const entityId = this.generateEntityId(entity.name, entity.type);
    const embedding = await dbClient.generateEmbedding(entity.name);
    
    // Check if exists
    const existing = await dbClient.executeQuery(
      `SELECT * FROM kg_entities WHERE entity_id = $1`,
      [entityId]
    );
    
    if (existing.rows && existing.rows.length > 0) {
      // Update: increase confidence and source count
      const current = existing.rows[0];
      const newConfidence = this.mergeConfidence(
        current.confidence,
        entity.confidence,
        current.source_count
      );
      
      await dbClient.executeQuery(`
        UPDATE kg_entities
        SET confidence = $1,
            source_count = source_count + 1,
            last_updated = CURRENT_TIMESTAMP,
            properties = $2
        WHERE entity_id = $3
      `, [newConfidence, JSON.stringify(entity.properties || {}), entityId]);
    } else {
      // Insert new
      await dbClient.executeQuery(`
        INSERT INTO kg_entities (entity_id, entity_type, name, embedding, confidence, properties)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        entityId,
        entity.type,
        entity.name,
        JSON.stringify(Array.from(embedding)),
        entity.confidence,
        JSON.stringify(entity.properties || {})
      ]);
    }
  }
  
  /**
   * Merge confidence scores (Bayesian update)
   */
  mergeConfidence(oldConf, newConf, sourceCount) {
    // More sources = more weight to historical confidence
    const oldWeight = Math.log(sourceCount + 1);
    const newWeight = 1.0;
    
    return (oldConf * oldWeight + newConf * newWeight) / (oldWeight + newWeight);
  }
  
  /**
   * Generate deterministic entity ID
   */
  generateEntityId(name, type) {
    const normalized = name.toLowerCase().trim();
    return `${type}:${normalized}`.replace(/[^a-z0-9:_-]/g, '_');
  }
  
  /**
   * Detect contradictions in new entities
   */
  async detectContradictions(entities) {
    const contradictions = [];
    
    for (const entity of entities) {
      // Find existing entity
      const entityId = this.generateEntityId(entity.name, entity.type);
      const existing = await dbClient.executeQuery(
        `SELECT * FROM kg_entities WHERE entity_id = $1`,
        [entityId]
      );
      
      if (existing.rows && existing.rows.length > 0) {
        const current = existing.rows[0];
        
        // Check for property conflicts
        const currentProps = current.properties || {};
        const newProps = entity.properties || {};
        
        for (const [key, newValue] of Object.entries(newProps)) {
          const oldValue = currentProps[key];
          if (oldValue && oldValue !== newValue) {
            contradictions.push({
              entityId: entityId,
              claimA: `${key} = ${oldValue}`,
              claimB: `${key} = ${newValue}`,
              sources: {
                old: current.source_count,
                new: 1
              }
            });
          }
        }
      }
    }
    
    return contradictions;
  }
  
  /**
   * Find relevant entities by vector similarity
   */
  async findRelevantEntities(queryEmbedding, limit = 20) {
    const result = await dbClient.executeQuery(`
      SELECT entity_id, entity_type, name, properties, confidence
      FROM kg_entities
      WHERE embedding IS NOT NULL
      ORDER BY embedding <-> $1
      LIMIT $2
    `, [JSON.stringify(Array.from(queryEmbedding)), limit]);
    
    return result.rows || [];
  }
  
  /**
   * Traverse knowledge graph from seed entities
   */
  async traverseGraph(seedEntities, depth = 2) {
    const visited = new Set();
    const graph = { nodes: [], edges: [] };
    const queue = seedEntities.map(e => ({ entity: e, depth: 0 }));
    
    while (queue.length > 0) {
      const { entity, depth: currentDepth } = queue.shift();
      const entityId = entity.entity_id || this.generateEntityId(entity.name, entity.type);
      
      if (visited.has(entityId) || currentDepth > depth) continue;
      visited.add(entityId);
      
      graph.nodes.push(entity);
      
      if (currentDepth < depth) {
        // Find relations from this entity
        const relations = await dbClient.executeQuery(`
          SELECT r.*, e.name as target_name, e.entity_type as target_type
          FROM kg_relations r
          JOIN kg_entities e ON r.target_entity = e.entity_id
          WHERE r.source_entity = $1
        `, [entityId]);
        
        for (const rel of (relations.rows || [])) {
          graph.edges.push({
            source: entityId,
            target: rel.target_entity,
            type: rel.relation_type,
            confidence: rel.confidence
          });
          
          queue.push({
            entity: {
              entity_id: rel.target_entity,
              name: rel.target_name,
              type: rel.target_type
            },
            depth: currentDepth + 1
          });
        }
      }
    }
    
    return graph;
  }
  
  /**
   * Get cached answer if high confidence exists
   */
  async getCachedAnswer(intent, similarReports) {
    if (!similarReports || similarReports.length === 0) return null;
    
    // Check if top result is very similar and recent
    const top = similarReports[0];
    const similarity = top.similarity || 0;
    const age = Date.now() - new Date(top.created_at).getTime();
    const ageHours = age / (1000 * 60 * 60);
    
    // High confidence cache hit: >90% similar, <24 hours old
    if (similarity > 0.90 && ageHours < 24) {
      return {
        content: top.content,
        confidence: similarity * (1 - ageHours / 168), // Decay over week
        source: 'cache',
        reportId: top.id,
        age: ageHours
      };
    }
    
    return null;
  }
  
  /**
   * Get or create user cognitive profile
   */
  async getUserProfile(userId) {
    const result = await dbClient.executeQuery(
      `SELECT * FROM kg_user_profiles WHERE user_id = $1`,
      [userId]
    );
    
    if (result.rows && result.rows.length > 0) {
      return result.rows[0];
    }
    
    // Create new profile
    const zeroEmbedding = new Array(this.vectorDimension).fill(0);
    await dbClient.executeQuery(`
      INSERT INTO kg_user_profiles (user_id, cognitive_embedding, preferences)
      VALUES ($1, $2, $3)
    `, [userId, JSON.stringify(zeroEmbedding), '{}']);
    
    return {
      user_id: userId,
      cognitive_embedding: zeroEmbedding,
      preferences: {},
      query_count: 0
    };
  }
  
  /**
   * Update user cognitive profile based on query patterns
   */
  async updateUserProfile(userId, intent, insights) {
    const profile = await this.getUserProfile(userId);
    
    // Update cognitive embedding (running average)
    const queryEmbed = intent.embedding || await dbClient.generateEmbedding(intent.query);
    const currentEmbed = profile.cognitive_embedding;
    const queryCount = profile.query_count || 0;
    
    // Weighted average: old profile + new query
    const alpha = 1.0 / (queryCount + 1); // Decay factor
    const updatedEmbed = currentEmbed.map((val, idx) => 
      val * (1 - alpha) + queryEmbed[idx] * alpha
    );
    
    // Update complexity average
    const avgComplexity = profile.avg_complexity || 0.5;
    const newAvgComplexity = (avgComplexity * queryCount + intent.complexity) / (queryCount + 1);
    
    await dbClient.executeQuery(`
      UPDATE kg_user_profiles
      SET cognitive_embedding = $1,
          query_count = query_count + 1,
          avg_complexity = $2,
          last_active = CURRENT_TIMESTAMP
      WHERE user_id = $3
    `, [JSON.stringify(updatedEmbed), newAvgComplexity, userId]);
  }
  
  /**
   * Upsert relation with confidence merging
   */
  async upsertRelation(relation) {
    const relationId = `${relation.source}__${relation.type}__${relation.target}`.replace(/[^a-z0-9_-]/gi, '_');
    
    const existing = await dbClient.executeQuery(
      `SELECT * FROM kg_relations WHERE relation_id = $1`,
      [relationId]
    );
    
    if (existing.rows && existing.rows.length > 0) {
      const current = existing.rows[0];
      const newConfidence = this.mergeConfidence(
        current.confidence,
        relation.confidence,
        current.source_count
      );
      
      await dbClient.executeQuery(`
        UPDATE kg_relations
        SET confidence = $1,
            source_count = source_count + 1,
            last_updated = CURRENT_TIMESTAMP
        WHERE relation_id = $2
      `, [newConfidence, relationId]);
    } else {
      // Create source and target entities if they don't exist
      const sourceId = this.generateEntityId(relation.source, 'term');
      const targetId = this.generateEntityId(relation.target, 'term');
      
      await dbClient.executeQuery(`
        INSERT INTO kg_relations (relation_id, source_entity, target_entity, relation_type, confidence)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (relation_id) DO NOTHING
      `, [relationId, sourceId, targetId, relation.type, relation.confidence]);
    }
  }
  
  /**
   * Record detected contradiction
   */
  async recordContradiction(contradiction) {
    const contradictionId = `contra_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    
    await dbClient.executeQuery(`
      INSERT INTO kg_contradictions (contradiction_id, entity_id, claim_a, claim_b)
      VALUES ($1, $2, $3, $4)
    `, [
      contradictionId,
      contradiction.entityId,
      contradiction.claimA,
      contradiction.claimB
    ]);
  }
  
  /**
   * Update pattern library (meta-learning)
   */
  async updatePatterns(intent, insights, memory) {
    // Detect if this was a successful quick-lookup
    if (memory.cachedAnswer && memory.confidence > 0.9) {
      await this.incrementPattern('quick-lookup-success', {
        complexity: intent.complexity,
        domain: intent.domain
      });
    }
    
    // Detect if user needed deep research
    if (insights.length > 5) {
      await this.incrementPattern('deep-research-needed', {
        complexity: intent.complexity,
        insightCount: insights.length
      });
    }
    
    // Pattern: queries that often lead to follow-ups
    // (Would track across sessions in production)
  }
  
  /**
   * Increment pattern observation count
   */
  async incrementPattern(patternType, data) {
    const patternId = `pattern_${patternType}`;
    
    await dbClient.executeQuery(`
      INSERT INTO kg_patterns (pattern_id, pattern_type, pattern_data, observation_count)
      VALUES ($1, $2, $3, 1)
      ON CONFLICT (pattern_id) DO UPDATE
      SET observation_count = kg_patterns.observation_count + 1,
          last_observed = CURRENT_TIMESTAMP,
          pattern_data = $3
    `, [patternId, patternType, JSON.stringify(data)]);
  }
  
  /**
   * Load patterns for policy optimization
   */
  async loadPatterns() {
    const result = await dbClient.executeQuery(`
      SELECT * FROM kg_patterns
      ORDER BY observation_count DESC
      LIMIT 100
    `, []);
    
    this.patterns = result.rows || [];
  }
  
  /**
   * Evolve: Self-improvement through meta-analysis
   * Run this nightly or on-demand
   */
  async evolve() {
    await this.initialize();
    
    // Analyze successful vs unsuccessful patterns
    const successPatterns = this.patterns.filter(p => p.pattern_type.includes('success'));
    const failurePatterns = this.patterns.filter(p => p.pattern_type.includes('fail'));
    
    // Generate insights about what works
    const metaInsights = {
      successRate: successPatterns.length / (this.patterns.length || 1),
      topPatterns: successPatterns.slice(0, 10),
      improvements: []
    };
    
    // Suggest improvements
    if (metaInsights.successRate < 0.7) {
      metaInsights.improvements.push('Increase research depth for complex queries');
    }
    
    // Store as meta-research report
    await dbClient.saveResearchReport({
      query: '[META] System performance analysis',
      content: JSON.stringify(metaInsights, null, 2),
      metadata: {
        type: 'meta-research',
        audience: 'system',
        patterns: metaInsights.topPatterns.length
      }
    });
    
    return metaInsights;
  }
  
  /**
   * Apply confidence decay (run daily)
   */
  async decayConfidence() {
    // Reduce confidence of entities not recently updated
    await dbClient.executeQuery(`
      UPDATE kg_entities
      SET confidence = confidence * $1
      WHERE last_updated < NOW() - INTERVAL '1 day'
    `, [this.confidenceDecay]);
    
    await dbClient.executeQuery(`
      UPDATE kg_relations
      SET confidence = confidence * $1
      WHERE last_updated < NOW() - INTERVAL '1 day'
    `, [this.confidenceDecay]);
  }
}

// Singleton instance
let instance = null;

function getInstance(options) {
  if (!instance) {
    instance = new LivingMemory(options);
  }
  return instance;
}

module.exports = {
  LivingMemory,
  getInstance,
  get instance() { return instance; }
};

