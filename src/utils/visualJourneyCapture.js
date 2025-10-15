// src/utils/visualJourneyCapture.js
/**
 * Visual Journey Capture - Screenshot Timeline Management
 * 
 * Captures every action taken by the computer agent with:
 * - Screenshots with metadata
 * - Action type and parameters
 * - Extracted data
 * - Visual embeddings for similarity search
 * 
 * Storage: PGlite with embeddings
 * Retrieval: "Show me when we looked at pricing" → relevant screenshots
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const dbClient = require('./dbClient');
const livingMemory = require('../intelligence/livingMemory');

class VisualJourneyCapture {
  constructor(options = {}) {
    this.baseOutputPath = options.baseOutputPath || './research_outputs';
    this.maxScreenshots = options.maxScreenshots || 100;
    this.compressionQuality = options.compressionQuality || 0.8;
  }

  /**
   * Initialize a new visual journey for a research session
   * @param {string} sessionId - Unique session identifier
   * @param {string} query - Research query
   * @returns {Promise<object>} Journey metadata
   */
  async initializeJourney(sessionId, query) {
    const journeyId = `journey-${sessionId}-${Date.now()}`;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const querySlug = query.substring(0, 50).replace(/[^a-z0-9]/gi, '-').toLowerCase();
    
    const outputDir = path.join(
      this.baseOutputPath,
      `${timestamp}_${querySlug}`
    );
    const screenshotsDir = path.join(outputDir, 'screenshots');
    
    // Create directories
    await fs.mkdir(outputDir, { recursive: true });
    await fs.mkdir(screenshotsDir, { recursive: true });
    
    const journey = {
      id: journeyId,
      sessionId,
      query,
      startTime: Date.now(),
      outputDir,
      screenshotsDir,
      screenshots: [],
      actions: [],
      metadata: {
        version: '1.0',
        created: new Date().toISOString()
      }
    };
    
    // Store in database
    await this._storeJourneyMetadata(journey);
    
    console.error(`[${new Date().toISOString()}] Visual journey initialized: ${journeyId}`);
    
    return journey;
  }

  /**
   * Capture a screenshot with full metadata
   * @param {string} journeyId - Journey identifier
   * @param {Buffer} screenshotBuffer - Screenshot image buffer
   * @param {object} metadata - Action metadata
   * @returns {Promise<object>} Screenshot record
   */
  async captureScreenshot(journeyId, screenshotBuffer, metadata = {}) {
    try {
      const journey = await this._getJourney(journeyId);
      
      if (!journey) {
        throw new Error(`Journey not found: ${journeyId}`);
      }
      
      const screenshotNumber = journey.screenshots.length + 1;
      const filename = `${String(screenshotNumber).padStart(3, '0')}-${metadata.action_type || 'capture'}.png`;
      const filepath = path.join(journey.screenshotsDir, filename);
      
      // Save screenshot to disk
      await fs.writeFile(filepath, screenshotBuffer);
      
      // Generate thumbnail (lower quality, smaller size)
      const thumbnailPath = path.join(
        journey.screenshotsDir,
        `thumb-${filename}`
      );
      // For now, use same image (TODO: implement actual thumbnail generation)
      await fs.writeFile(thumbnailPath, screenshotBuffer);
      
      // Generate visual embedding
      let embedding = null;
      try {
        embedding = await livingMemory.embedScreenshot(screenshotBuffer);
      } catch (error) {
        console.warn('Failed to generate visual embedding:', error);
      }
      
      // Create screenshot record
      const screenshot = {
        id: crypto.randomUUID(),
        journeyId,
        number: screenshotNumber,
        filename,
        filepath,
        thumbnailPath,
        timestamp: Date.now(),
        metadata: {
          url: metadata.url,
          action_type: metadata.action_type,
          selector: metadata.selector,
          description: metadata.description,
          extracted_data: metadata.extracted_data,
          viewport: metadata.viewport,
          ...metadata
        },
        size: screenshotBuffer.length,
        embedding: embedding ? Array.from(embedding) : null
      };
      
      // Store in database
      await this._storeScreenshot(screenshot);
      
      // Update journey
      journey.screenshots.push(screenshot);
      
      console.error(`[${new Date().toISOString()}] Screenshot captured: ${filename} (${(screenshotBuffer.length / 1024).toFixed(1)}KB)`);
      
      return screenshot;
    } catch (error) {
      console.error('Screenshot capture error:', error);
      throw error;
    }
  }

  /**
   * Record an action in the journey
   * @param {string} journeyId - Journey identifier
   * @param {object} action - Action details
   * @returns {Promise<object>} Action record
   */
  async recordAction(journeyId, action) {
    const journey = await this._getJourney(journeyId);
    
    if (!journey) {
      throw new Error(`Journey not found: ${journeyId}`);
    }
    
    const actionRecord = {
      id: crypto.randomUUID(),
      journeyId,
      number: journey.actions.length + 1,
      timestamp: Date.now(),
      type: action.type,
      target: action.target,
      value: action.value,
      params: action.params,
      result: action.result,
      success: action.success !== false,
      durationMs: action.durationMs
    };
    
    // Store in database
    await this._storeAction(actionRecord);
    
    journey.actions.push(actionRecord);
    
    return actionRecord;
  }

  /**
   * Complete a journey and generate documentation
   * @param {string} journeyId - Journey identifier
   * @returns {Promise<object>} Journey summary with documentation paths
   */
  async completeJourney(journeyId) {
    const journey = await this._getJourney(journeyId);
    
    if (!journey) {
      throw new Error(`Journey not found: ${journeyId}`);
    }
    
    journey.endTime = Date.now();
    journey.durationMs = journey.endTime - journey.startTime;
    
    // Generate documentation
    const docs = await this._generateDocumentation(journey);
    
    // Store completion
    await this._completeJourneyInDb(journeyId, {
      endTime: journey.endTime,
      durationMs: journey.durationMs,
      screenshotCount: journey.screenshots.length,
      actionCount: journey.actions.length,
      documentationPaths: docs
    });
    
    console.error(`[${new Date().toISOString()}] Visual journey complete: ${journeyId} (${journey.screenshots.length} screenshots, ${(journey.durationMs / 1000).toFixed(1)}s)`);
    
    return {
      journey,
      documentation: docs
    };
  }

  /**
   * Search for similar screenshots
   * @param {string} query - Natural language query
   * @param {number} limit - Max results
   * @returns {Promise<Array>} Similar screenshots
   */
  async searchScreenshots(query, limit = 10) {
    try {
      // Generate query embedding
      const queryEmbedding = await dbClient.generateEmbedding(query);
      
      if (!queryEmbedding) {
        return [];
      }
      
      // Search in database
      const results = await dbClient.executeQuery(`
        SELECT 
          id, journey_id, number, filename, filepath, timestamp,
          metadata, size,
          1 - (embedding <=> $1::vector) AS similarity
        FROM visual_journey_screenshots
        WHERE embedding IS NOT NULL
        AND 1 - (embedding <=> $1::vector) >= 0.7
        ORDER BY similarity DESC
        LIMIT $2
      `, [JSON.stringify(queryEmbedding), limit]);
      
      return results || [];
    } catch (error) {
      console.error('Screenshot search error:', error);
      return [];
    }
  }

  /**
   * Get journey by ID
   * @param {string} journeyId - Journey identifier
   * @returns {Promise<object|null>} Journey or null
   */
  async getJourney(journeyId) {
    return await this._getJourney(journeyId);
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /**
   * Store journey metadata in database
   * @private
   */
  async _storeJourneyMetadata(journey) {
    const sql = `
      INSERT INTO visual_journeys (
        id, session_id, query, start_time, output_dir, screenshots_dir, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;
    
    try {
      await dbClient.executeQuery(sql, [
        journey.id,
        journey.sessionId,
        journey.query,
        journey.startTime,
        journey.outputDir,
        journey.screenshotsDir,
        JSON.stringify(journey.metadata)
      ]);
    } catch (error) {
      // Table might not exist yet - create it
      await this._ensureTables();
      // Retry
      await dbClient.executeQuery(sql, [
        journey.id,
        journey.sessionId,
        journey.query,
        journey.startTime,
        journey.outputDir,
        journey.screenshotsDir,
        JSON.stringify(journey.metadata)
      ]);
    }
  }

  /**
   * Ensure visual journey tables exist
   * @private
   */
  async _ensureTables() {
    await dbClient.executeQuery(`
      CREATE TABLE IF NOT EXISTS visual_journeys (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        query TEXT NOT NULL,
        start_time BIGINT NOT NULL,
        end_time BIGINT,
        duration_ms BIGINT,
        output_dir TEXT NOT NULL,
        screenshots_dir TEXT NOT NULL,
        screenshot_count INTEGER DEFAULT 0,
        action_count INTEGER DEFAULT 0,
        metadata TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `, []);
    
    await dbClient.executeQuery(`
      CREATE TABLE IF NOT EXISTS visual_journey_screenshots (
        id TEXT PRIMARY KEY,
        journey_id TEXT NOT NULL,
        number INTEGER NOT NULL,
        filename TEXT NOT NULL,
        filepath TEXT NOT NULL,
        thumbnail_path TEXT,
        timestamp BIGINT NOT NULL,
        metadata TEXT,
        size INTEGER,
        embedding vector(384),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (journey_id) REFERENCES visual_journeys(id)
      )
    `, []);
    
    await dbClient.executeQuery(`
      CREATE TABLE IF NOT EXISTS visual_journey_actions (
        id TEXT PRIMARY KEY,
        journey_id TEXT NOT NULL,
        number INTEGER NOT NULL,
        timestamp BIGINT NOT NULL,
        type TEXT NOT NULL,
        target TEXT,
        value TEXT,
        params TEXT,
        result TEXT,
        success BOOLEAN DEFAULT TRUE,
        duration_ms INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (journey_id) REFERENCES visual_journeys(id)
      )
    `, []);
    
    console.error('Visual journey tables created');
  }

  /**
   * Store screenshot in database
   * @private
   */
  async _storeScreenshot(screenshot) {
    const sql = `
      INSERT INTO visual_journey_screenshots (
        id, journey_id, number, filename, filepath, thumbnail_path,
        timestamp, metadata, size, embedding
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::vector)
    `;
    
    await dbClient.executeQuery(sql, [
      screenshot.id,
      screenshot.journeyId,
      screenshot.number,
      screenshot.filename,
      screenshot.filepath,
      screenshot.thumbnailPath,
      screenshot.timestamp,
      JSON.stringify(screenshot.metadata),
      screenshot.size,
      screenshot.embedding ? JSON.stringify(screenshot.embedding) : null
    ]);
  }

  /**
   * Store action in database
   * @private
   */
  async _storeAction(action) {
    const sql = `
      INSERT INTO visual_journey_actions (
        id, journey_id, number, timestamp, type, target, value, params, result, success, duration_ms
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `;
    
    await dbClient.executeQuery(sql, [
      action.id,
      action.journeyId,
      action.number,
      action.timestamp,
      action.type,
      action.target,
      action.value,
      JSON.stringify(action.params),
      JSON.stringify(action.result),
      action.success,
      action.durationMs
    ]);
  }

  /**
   * Get journey from database
   * @private
   */
  async _getJourney(journeyId) {
    const results = await dbClient.executeQuery(`
      SELECT * FROM visual_journeys WHERE id = $1
    `, [journeyId]);
    
    if (!results || results.length === 0) {
      return null;
    }
    
    const row = results[0];
    
    // Load screenshots
    const screenshots = await dbClient.executeQuery(`
      SELECT * FROM visual_journey_screenshots WHERE journey_id = $1 ORDER BY number
    `, [journeyId]);
    
    // Load actions
    const actions = await dbClient.executeQuery(`
      SELECT * FROM visual_journey_actions WHERE journey_id = $1 ORDER BY number
    `, [journeyId]);
    
    return {
      id: row.id,
      sessionId: row.session_id,
      query: row.query,
      startTime: row.start_time,
      endTime: row.end_time,
      durationMs: row.duration_ms,
      outputDir: row.output_dir,
      screenshotsDir: row.screenshots_dir,
      screenshots: screenshots || [],
      actions: actions || [],
      metadata: row.metadata ? JSON.parse(row.metadata) : {}
    };
  }

  /**
   * Complete journey in database
   * @private
   */
  async _completeJourneyInDb(journeyId, completionData) {
    await dbClient.executeQuery(`
      UPDATE visual_journeys
      SET 
        end_time = $2,
        duration_ms = $3,
        screenshot_count = $4,
        action_count = $5,
        metadata = json_patch(metadata, $6::text)
      WHERE id = $1
    `, [
      journeyId,
      completionData.endTime,
      completionData.durationMs,
      completionData.screenshotCount,
      completionData.actionCount,
      JSON.stringify({ completion: completionData })
    ]);
  }

  /**
   * Generate documentation from journey
   * @private
   */
  async _generateDocumentation(journey) {
    const markdownRenderer = require('./markdownRenderer');
    
    const docs = {};
    
    try {
      // Generate visual journey markdown
      docs.visualJourney = await markdownRenderer.renderVisualJourney(journey);
      
      // Generate timeline
      docs.timeline = await markdownRenderer.renderTimeline(journey);
      
      // Generate summary
      docs.summary = await markdownRenderer.renderJourneySummary(journey);
      
      return docs;
    } catch (error) {
      console.error('Documentation generation error:', error);
      return { error: error.message };
    }
  }

  /**
   * Calculate journey statistics
   */
  async getJourneyStats(journeyId) {
    const journey = await this._getJourney(journeyId);
    
    if (!journey) {
      return null;
    }
    
    const successfulActions = journey.actions.filter(a => a.success).length;
    const successRate = journey.actions.length > 0
      ? (successfulActions / journey.actions.length) * 100
      : 0;
    
    const uniqueUrls = new Set(
      journey.screenshots.map(s => s.metadata?.url).filter(Boolean)
    ).size;
    
    return {
      journeyId,
      query: journey.query,
      duration: {
        ms: journey.durationMs,
        seconds: Math.round(journey.durationMs / 1000),
        formatted: this._formatDuration(journey.durationMs)
      },
      screenshots: {
        total: journey.screenshots.length,
        avgSize: journey.screenshots.length > 0
          ? Math.round(journey.screenshots.reduce((sum, s) => sum + s.size, 0) / journey.screenshots.length / 1024)
          : 0,
        totalSize: Math.round(journey.screenshots.reduce((sum, s) => sum + s.size, 0) / 1024)
      },
      actions: {
        total: journey.actions.length,
        successful: successfulActions,
        failed: journey.actions.length - successfulActions,
        successRate: Math.round(successRate)
      },
      exploration: {
        uniqueUrls,
        avgTimePerUrl: uniqueUrls > 0 && journey.durationMs
          ? Math.round(journey.durationMs / uniqueUrls)
          : 0
      }
    };
  }

  /**
   * Format duration in human-readable form
   * @private
   */
  _formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }
}

// Singleton instance
const visualJourneyCapture = new VisualJourneyCapture();

module.exports = visualJourneyCapture;
module.exports.VisualJourneyCapture = VisualJourneyCapture;

