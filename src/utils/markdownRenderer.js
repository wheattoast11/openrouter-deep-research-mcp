// src/utils/markdownRenderer.js
/**
 * Markdown Renderer - Beautiful Documentation Generation
 * 
 * Features:
 * - Embed screenshots as base64 data URIs
 * - Syntax highlighting
 * - Mermaid diagram rendering
 * - Handlebars template processing
 * - Dreamspace theme CSS
 * 
 * Outputs: Both .md and .html files
 */

const fs = require('fs').promises;
const path = require('path');
const Handlebars = require('handlebars');

class MarkdownRenderer {
  constructor() {
    this.templates = {};
    this.templatesLoaded = false;
  }

  /**
   * Initialize and load templates
   */
  async initialize() {
    if (this.templatesLoaded) return;
    
    try {
      const templatesDir = path.join(__dirname, '../../templates/reports');
      
      this.templates.visualJourney = await this._loadTemplate(
        path.join(templatesDir, 'visual_journey_template.md')
      );
      this.templates.researchReport = await this._loadTemplate(
        path.join(templatesDir, 'research_report_template.md')
      );
      this.templates.synthesis = await this._loadTemplate(
        path.join(templatesDir, 'synthesis_template.md')
      );
      this.templates.graphVisualization = await this._loadTemplate(
        path.join(templatesDir, 'graph_visualization_template.md')
      );
      
      // Register Handlebars helpers
      this._registerHelpers();
      
      this.templatesLoaded = true;
      console.error('Markdown templates loaded successfully');
    } catch (error) {
      console.error('Template loading error:', error);
      this.templatesLoaded = false;
    }
  }

  /**
   * Render visual journey documentation
   * @param {object} journey - Journey data
   * @returns {Promise<string>} Path to generated markdown
   */
  async renderVisualJourney(journey) {
    await this.initialize();
    
    try {
      // Prepare template data
      const data = {
        query: journey.query,
        start_time: new Date(journey.startTime).toISOString(),
        end_time: journey.endTime ? new Date(journey.endTime).toISOString() : 'In progress',
        duration_ms: journey.durationMs || (Date.now() - journey.startTime),
        screenshots: await this._prepareScreenshots(journey.screenshots),
        sources: this._extractSources(journey.screenshots),
        screenshot_count: journey.screenshots.length,
        action_count: journey.actions.length,
        success_rate: this._calculateSuccessRate(journey.actions),
        report_id: journey.sessionId,
        embedding_count: journey.screenshots.filter(s => s.embedding).length,
        version: require('../../package.json').version
      };
      
      // Render markdown
      const template = Handlebars.compile(this.templates.visualJourney || '# Visual Journey\n\n{{query}}');
      const markdown = template(data);
      
      // Save to file
      const outputPath = path.join(journey.outputDir, 'visual-journey.md');
      await fs.writeFile(outputPath, markdown, 'utf8');
      
      // Generate HTML version
      const htmlPath = await this._renderToHtml(markdown, journey.outputDir, 'visual-journey.html');
      
      return {
        markdown: outputPath,
        html: htmlPath
      };
    } catch (error) {
      console.error('Visual journey rendering error:', error);
      throw error;
    }
  }

  /**
   * Render timeline
   */
  async renderTimeline(journey) {
    const timelineData = {
      query: journey.query,
      steps: journey.actions.map((action, index) => ({
        number: index + 1,
        timestamp: new Date(action.timestamp).toLocaleTimeString(),
        type: action.type,
        target: action.target,
        success: action.success,
        duration: action.durationMs ? `${action.durationMs}ms` : '-'
      }))
    };
    
    const markdown = `# Action Timeline\n\n## Query: ${journey.query}\n\n${
      timelineData.steps.map(s => 
        `${s.number}. **${s.type}** \`${s.target}\` - ${s.success ? '✓' : '✗'} (${s.timestamp})`
      ).join('\n')
    }`;
    
    const outputPath = path.join(journey.outputDir, 'timeline.md');
    await fs.writeFile(outputPath, markdown, 'utf8');
    
    return outputPath;
  }

  /**
   * Render journey summary
   */
  async renderJourneySummary(journey) {
    const stats = {
      screenshots: journey.screenshots.length,
      actions: journey.actions.length,
      successRate: this._calculateSuccessRate(journey.actions),
      duration: this._formatDuration(journey.durationMs || 0),
      uniqueUrls: new Set(journey.screenshots.map(s => s.metadata?.url).filter(Boolean)).size
    };
    
    const markdown = `# Journey Summary

**Query**: ${journey.query}
**Duration**: ${stats.duration}
**Screenshots**: ${stats.screenshots}
**Actions**: ${stats.actions}
**Success Rate**: ${stats.successRate}%
**URLs Visited**: ${stats.uniqueUrls}
`;
    
    const outputPath = path.join(journey.outputDir, 'summary.md');
    await fs.writeFile(outputPath, markdown, 'utf8');
    
    return outputPath;
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  /**
   * Load template file
   * @private
   */
  async _loadTemplate(filepath) {
    try {
      return await fs.readFile(filepath, 'utf8');
    } catch (error) {
      console.warn(`Template not found: ${filepath}`);
      return '';
    }
  }

  /**
   * Register Handlebars helpers
   * @private
   */
  _registerHelpers() {
    Handlebars.registerHelper('json', (obj) => {
      return JSON.stringify(obj, null, 2);
    });
    
    Handlebars.registerHelper('formatDate', (timestamp) => {
      return new Date(timestamp).toISOString();
    });
    
    Handlebars.registerHelper('percentage', (value) => {
      return Math.round(value * 100) + '%';
    });
  }

  /**
   * Prepare screenshots with embedded images
   * @private
   */
  async _prepareScreenshots(screenshots) {
    const prepared = [];
    
    for (const screenshot of screenshots) {
      try {
        // Read screenshot file
        const imageBuffer = await fs.readFile(screenshot.filepath);
        const base64 = imageBuffer.toString('base64');
        
        prepared.push({
          ...screenshot,
          path: `data:image/png;base64,${base64}`,
          metadata: typeof screenshot.metadata === 'string' 
            ? JSON.parse(screenshot.metadata)
            : screenshot.metadata
        });
      } catch (error) {
        console.warn(`Failed to load screenshot: ${screenshot.filepath}`);
        prepared.push(screenshot);
      }
    }
    
    return prepared;
  }

  /**
   * Extract unique sources from screenshots
   * @private
   */
  _extractSources(screenshots) {
    const sources = [];
    const seen = new Set();
    
    for (const screenshot of screenshots) {
      const metadata = typeof screenshot.metadata === 'string'
        ? JSON.parse(screenshot.metadata)
        : screenshot.metadata || {};
      
      const url = metadata.url;
      if (url && !seen.has(url)) {
        seen.add(url);
        sources.push({
          url,
          title: metadata.title || url,
          timestamp: new Date(screenshot.timestamp).toISOString()
        });
      }
    }
    
    return sources;
  }

  /**
   * Calculate success rate
   * @private
   */
  _calculateSuccessRate(actions) {
    if (actions.length === 0) return 100;
    
    const successful = actions.filter(a => a.success !== false).length;
    return Math.round((successful / actions.length) * 100);
  }

  /**
   * Format duration
   * @private
   */
  _formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }

  /**
   * Render markdown to HTML
   * @private
   */
  async _renderToHtml(markdown, outputDir, filename) {
    // For now, just wrap in basic HTML
    // TODO: Use marked.js or similar for proper markdown rendering
    
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Visual Journey</title>
  <style>
    ${this._getDreamspaceThemeCSS()}
  </style>
</head>
<body>
  <div class="container">
    <pre class="markdown-content">${this._escapeHtml(markdown)}</pre>
  </div>
</body>
</html>`;
    
    const htmlPath = path.join(outputDir, filename);
    await fs.writeFile(htmlPath, html, 'utf8');
    
    return htmlPath;
  }

  /**
   * Get Dreamspace theme CSS
   * @private
   */
  _getDreamspaceThemeCSS() {
    return `
      body {
        margin: 0;
        padding: 0;
        background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
        color: #f8fafc;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      .container {
        max-width: 1200px;
        margin: 0 auto;
        padding: 40px 20px;
      }
      .markdown-content {
        line-height: 1.6;
        font-size: 14px;
        white-space: pre-wrap;
        background: rgba(30, 41, 59, 0.6);
        padding: 24px;
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.1);
      }
      img {
        max-width: 100%;
        border-radius: 8px;
        margin: 16px 0;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
      }
    `;
  }

  /**
   * Escape HTML
   * @private
   */
  _escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }
}

// Singleton instance
const markdownRenderer = new MarkdownRenderer();

module.exports = markdownRenderer;
module.exports.MarkdownRenderer = MarkdownRenderer;




