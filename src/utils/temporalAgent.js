// src/utils/temporalAgent.js
// Temporal awareness and scheduled actions for proactive agent behavior

const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');
const dbClient = require('./dbClient');

class TemporalAgent {
  constructor() {
    this.schedules = new Map();
    this.eventBus = null; // Will be set by server
  }

  /**
   * Set the event bus for broadcasting proactive messages
   */
  setEventBus(eventBus) {
    this.eventBus = eventBus;
  }

  /**
   * Schedule a proactive agent action
   * @param {string} cronExpression - Cron expression (e.g., "0 9 * * *")
   * @param {object} action - Action to execute
   * @param {object} options - Additional options
   * @returns {string} Schedule ID
   */
  schedule(cronExpression, action, options = {}) {
    const scheduleId = options.id || `sched_${Date.now()}_${uuidv4().slice(0, 8)}`;
    
    if (!cron.validate(cronExpression)) {
      throw new Error(`Invalid cron expression: ${cronExpression}`);
    }

    const task = cron.schedule(cronExpression, async () => {
      console.error(`[${new Date().toISOString()}] [${scheduleId}] Executing scheduled action: ${action.type}`);
      
      try {
        await this.executeScheduledAction(scheduleId, action);
      } catch (error) {
        console.error(`[${new Date().toISOString()}] [${scheduleId}] Error executing scheduled action:`, error);
        
        if (this.eventBus) {
          this.eventBus.broadcast('temporal.action_failed', {
            scheduleId,
            action,
            error: error.message
          });
        }
      }
    }, {
      scheduled: false, // Don't start immediately
      timezone: options.timezone || 'UTC'
    });

    this.schedules.set(scheduleId, {
      id: scheduleId,
      cronExpression,
      action,
      task,
      createdAt: new Date().toISOString(),
      enabled: false,
      ...options
    });

    console.error(`[${new Date().toISOString()}] [${scheduleId}] Scheduled action created: ${cronExpression}`);
    
    return scheduleId;
  }

  /**
   * Execute a scheduled action
   */
  async executeScheduledAction(scheduleId, action) {
    const schedule = this.schedules.get(scheduleId);
    
    if (!schedule) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    // Create a job for the scheduled action
    let jobId;
    
    switch (action.type) {
      case 'research':
        jobId = await dbClient.createJob('research', {
          query: action.query,
          costPreference: action.costPreference || 'low',
          audienceLevel: action.audienceLevel || 'intermediate',
          scheduledBy: scheduleId
        });
        
        await dbClient.appendJobEvent(jobId, 'scheduled_execution', {
          scheduleId,
          cronExpression: schedule.cronExpression
        });
        
        // Notify via event bus
        if (this.eventBus) {
          this.eventBus.broadcast('temporal.action_triggered', {
            scheduleId,
            jobId,
            action,
            timestamp: new Date().toISOString()
          });
        }
        break;
        
      case 'briefing':
        // Generate a summary of recent knowledge base updates
        const recentReports = await dbClient.listRecentReports(10);
        const briefing = this.generateBriefing(recentReports);
        
        if (this.eventBus) {
          this.eventBus.broadcast('temporal.briefing_generated', {
            scheduleId,
            briefing,
            timestamp: new Date().toISOString()
          });
        }
        break;
        
      case 'monitor':
        // Check for new information on a topic
        const results = await dbClient.searchHybrid(action.query, 5);
        
        if (results.length > 0) {
          if (this.eventBus) {
            this.eventBus.broadcast('temporal.monitor_update', {
              scheduleId,
              query: action.query,
              newResults: results.length,
              topResults: results.slice(0, 3)
            });
          }
        }
        break;
        
      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  /**
   * Generate a briefing from recent reports
   */
  generateBriefing(reports) {
    if (reports.length === 0) {
      return 'No recent activity in the knowledge base.';
    }

    const items = reports.map((r, i) => {
      const query = r.originalQuery || r.original_query || 'Unknown query';
      const date = new Date(r.created_at || r.createdAt).toLocaleDateString();
      return `${i + 1}. ${query} (${date})`;
    }).join('\n');

    return `Recent Knowledge Base Activity (${reports.length} reports):\n${items}`;
  }

  /**
   * Enable a scheduled task
   */
  enable(scheduleId) {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    if (!schedule.enabled) {
      schedule.task.start();
      schedule.enabled = true;
      console.error(`[${new Date().toISOString()}] [${scheduleId}] Schedule enabled`);
    }

    return true;
  }

  /**
   * Disable a scheduled task
   */
  disable(scheduleId) {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    if (schedule.enabled) {
      schedule.task.stop();
      schedule.enabled = false;
      console.error(`[${new Date().toISOString()}] [${scheduleId}] Schedule disabled`);
    }

    return true;
  }

  /**
   * Delete a schedule
   */
  delete(scheduleId) {
    const schedule = this.schedules.get(scheduleId);
    if (schedule) {
      schedule.task.stop();
      schedule.task.destroy();
      this.schedules.delete(scheduleId);
      console.error(`[${new Date().toISOString()}] [${scheduleId}] Schedule deleted`);
      return true;
    }
    return false;
  }

  /**
   * List all schedules
   */
  list() {
    const schedules = [];
    this.schedules.forEach((schedule) => {
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

  /**
   * Get a specific schedule
   */
  get(scheduleId) {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) return null;

    return {
      id: schedule.id,
      cronExpression: schedule.cronExpression,
      action: schedule.action,
      enabled: schedule.enabled,
      createdAt: schedule.createdAt
    };
  }

  /**
   * Clean up all schedules
   */
  shutdown() {
    console.error(`[${new Date().toISOString()}] Shutting down temporal agent...`);
    this.schedules.forEach((schedule) => {
      schedule.task.stop();
      schedule.task.destroy();
    });
    this.schedules.clear();
  }
}

module.exports = new TemporalAgent();

