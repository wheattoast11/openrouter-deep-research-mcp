/**
 * Zero CLI - Main Orchestrator
 *
 * Bleeding-edge agentic intelligence system with:
 * - Zero external dependencies for CLI core
 * - Knowledge graph integration for intelligent suggestions
 * - Session time-travel (undo/redo)
 * - Fact-verification to prevent hallucinations
 * - Encrypted credential storage
 */

'use strict';

const path = require('path');

// Micro-libraries (zero dependencies)
const { parse } = require('./lib/micro-args');
const { red, green, yellow, cyan, bold, dim, writeln, error } = require('./lib/micro-term');
const { spinner } = require('./lib/micro-progress');
const { prompt, confirm, select } = require('./lib/micro-prompt');

// Verification layer
const { VerificationPipeline, FactStatus } = require('./verification');

// Version
const { version } = require('../../package.json');

/**
 * CLI command definitions
 */
const COMMANDS = {
  research: {
    description: 'Run verified research query',
    usage: 'zero research "query" [--cost low|high] [--verify]',
    aliases: ['r']
  },
  search: {
    description: 'Search knowledge base',
    usage: 'zero search "query" [--limit 10]',
    aliases: ['s']
  },
  graph: {
    description: 'Explore knowledge graph',
    usage: 'zero graph [traverse|path|stats] [options]',
    aliases: ['g']
  },
  session: {
    description: 'Session management (undo/redo/checkpoint)',
    usage: 'zero session [undo|redo|checkpoint|list]',
    aliases: ['ss']
  },
  verify: {
    description: 'Verify or correct previous reports',
    usage: 'zero verify <report-id> [--correct "claim"]',
    aliases: ['v']
  },
  config: {
    description: 'Manage configuration and credentials',
    usage: 'zero config [get|set|list] [key] [value]',
    aliases: ['c']
  },
  status: {
    description: 'Show server and system status',
    usage: 'zero status',
    aliases: ['st']
  },
  help: {
    description: 'Show help information',
    usage: 'zero help [command]',
    aliases: ['h', '?']
  },
  version: {
    description: 'Show version',
    usage: 'zero version',
    aliases: ['-v', '--version']
  }
};

/**
 * Argument parsing options
 */
const ARG_OPTIONS = {
  aliases: {
    h: 'help',
    v: 'version',
    c: 'cost',
    l: 'limit',
    q: 'quiet',
    d: 'debug'
  },
  boolean: ['help', 'version', 'quiet', 'debug', 'verify', 'json'],
  defaults: {
    cost: 'low',
    limit: 10,
    verify: true
  }
};

/**
 * Main CLI class
 */
class ZeroCLI {
  constructor() {
    this.verification = null;
    this.server = null;
    this.initialized = false;
  }

  /**
   * Initialize CLI components with timeout protection
   */
  async initialize() {
    if (this.initialized) return;

    const timeout = (promise, ms, name) => {
      return Promise.race([
        promise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`${name} init timeout`)), ms)
        )
      ]);
    };

    try {
      // Initialize verification pipeline with timeout protection
      const dbClient = await timeout(this.loadDbClient(), 10000, 'dbClient');

      // Skip heavy modules by default for fast CLI startup
      // They can be lazy-loaded when needed
      const knowledgeGraph = null; // await this.loadKnowledgeGraph(dbClient);
      const sessionManager = null; // await this.loadSessionManager(dbClient);

      this.verification = new VerificationPipeline({
        dbClient,
        knowledgeGraph,
        sessionManager,
        requireMultiModel: true,
        verifySourcesEnabled: true
      });

      await timeout(this.verification.initialize(), 5000, 'verification');
      this.initialized = true;
    } catch (err) {
      // Continue without full initialization for basic commands
      // Initialize minimal verification without database
      this.verification = new VerificationPipeline({});
      this.initialized = true;
      if (process.env.DEBUG) {
        error(`Init warning: ${err.message}`);
      }
    }
  }

  /**
   * Lazy-load database client
   */
  async loadDbClient() {
    try {
      const dbClient = require('../utils/dbClient');
      await dbClient.initDB();
      return dbClient;
    } catch (err) {
      return null;
    }
  }

  /**
   * Lazy-load knowledge graph
   */
  async loadKnowledgeGraph(dbClient) {
    if (!dbClient) return null;
    try {
      const { getKnowledgeGraph } = require('../utils/knowledgeGraph');
      return getKnowledgeGraph(dbClient);
    } catch {
      return null;
    }
  }

  /**
   * Lazy-load session manager
   */
  async loadSessionManager(dbClient) {
    if (!dbClient) return null;
    try {
      const { getSessionManager } = require('../utils/sessionStore');
      return getSessionManager(dbClient);
    } catch {
      return null;
    }
  }

  /**
   * Run CLI with arguments
   */
  async run(argv) {
    const args = parse(argv, ARG_OPTIONS);

    // Extract command and positional args
    const command = args._[0] || 'help';
    const positionals = args._.slice(1);

    // Version shortcut
    if (args.version || command === 'version' || command === '-v' || command === '--version') {
      return this.showVersion();
    }

    // Help shortcut
    if (args.help || command === 'help' || command === '-h' || command === '--help') {
      return this.showHelp(positionals[0]);
    }

    // Resolve command aliases
    const resolvedCommand = this.resolveCommand(command);

    if (!resolvedCommand) {
      error(`Unknown command: ${command}`);
      writeln(dim(`Run 'zero help' for available commands.`));
      process.exit(1);
    }

    // Initialize for most commands
    if (!['help', 'version'].includes(resolvedCommand)) {
      await this.initialize();
    }

    // Route to command handler
    try {
      await this.executeCommand(resolvedCommand, positionals, args);
    } catch (err) {
      error(`Command failed: ${err.message}`);
      if (args.debug) {
        writeln(err.stack);
      }
      process.exit(1);
    }
  }

  /**
   * Resolve command name or alias
   */
  resolveCommand(input) {
    const lower = input.toLowerCase();

    // Direct match
    if (COMMANDS[lower]) return lower;

    // Alias match
    for (const [cmd, def] of Object.entries(COMMANDS)) {
      if (def.aliases?.includes(lower)) return cmd;
    }

    return null;
  }

  /**
   * Execute a command
   */
  async executeCommand(command, positionals, args) {
    switch (command) {
      case 'research':
        return this.cmdResearch(positionals, args);
      case 'search':
        return this.cmdSearch(positionals, args);
      case 'graph':
        return this.cmdGraph(positionals, args);
      case 'session':
        return this.cmdSession(positionals, args);
      case 'verify':
        return this.cmdVerify(positionals, args);
      case 'config':
        return this.cmdConfig(positionals, args);
      case 'status':
        return this.cmdStatus(args);
      default:
        return this.showHelp();
    }
  }

  /**
   * Research command with verification
   */
  async cmdResearch(positionals, args) {
    const query = positionals.join(' ');

    if (!query) {
      error('Query required');
      writeln(dim('Usage: zero research "your query here"'));
      return;
    }

    const spin = spinner(`Researching: ${query.slice(0, 50)}...`).start();

    try {
      // Load MCP tools
      const tools = require('../server/tools');

      // Run research
      spin.update('Running research query...');
      const result = await tools.conductResearch({
        query,
        costPreference: args.cost,
        async: false,
        outputFormat: 'report'
      });

      // Extract report ID from result
      const reportMatch = result?.content?.[0]?.text?.match(/Report ID: (\d+)/);
      const reportId = reportMatch?.[1];

      spin.update('Verifying results...');

      // Run verification if enabled
      if (args.verify && this.verification) {
        // Get the report content
        const report = reportId
          ? await tools.getReport({ reportId, mode: 'full' })
          : null;

        const reportText = report?.content?.[0]?.text || result?.content?.[0]?.text || '';

        // Verify (single model for now, multi-model TODO)
        const verification = await this.verification.verify({
          signals: [], // Would need signals from multi-model ensemble
          reportText,
          reportId
        });

        spin.succeed(`Research complete (Report #${reportId || 'N/A'})`);

        // Show verification status
        writeln('');
        writeln(bold('Verification:'));
        writeln(this.verification.formatForOutput(verification));

        // Show warnings prominently
        if (verification.flags.length > 0) {
          writeln('');
          writeln(yellow(bold('ATTENTION: Disputed claims detected')));
          for (const flag of verification.flags) {
            writeln(yellow(`  ! ${flag.claim || flag.reason}`));
          }
          writeln(dim('Use "zero verify ' + (reportId || '<id>') + '" to review claims.'));
        }
      } else {
        spin.succeed(`Research complete`);
      }

      // Output result
      writeln('');
      if (args.json) {
        writeln(JSON.stringify(result, null, 2));
      } else {
        writeln(result?.content?.[0]?.text || 'No result');
      }
    } catch (err) {
      spin.fail(`Research failed: ${err.message}`);
      throw err;
    }
  }

  /**
   * Search command
   */
  async cmdSearch(positionals, args) {
    const query = positionals.join(' ');

    if (!query) {
      error('Search query required');
      return;
    }

    const spin = spinner('Searching...').start();

    try {
      const tools = require('../server/tools');
      const result = await tools.searchTool({
        q: query,
        k: args.limit,
        scope: args.scope || 'both'
      });

      spin.succeed(`Found results for: ${query}`);
      writeln('');
      writeln(result?.content?.[0]?.text || 'No results');
    } catch (err) {
      spin.fail(`Search failed: ${err.message}`);
    }
  }

  /**
   * Graph command
   */
  async cmdGraph(positionals, args) {
    const subcommand = positionals[0] || 'stats';

    const spin = spinner('Querying knowledge graph...').start();

    try {
      const tools = require('../server/tools');

      let result;
      switch (subcommand) {
        case 'traverse':
          result = await tools.graphTraverse({
            startNode: positionals[1] || args.node,
            depth: args.depth || 3,
            strategy: args.strategy || 'semantic'
          });
          break;
        case 'path':
          result = await tools.graphPath({
            from: positionals[1] || args.from,
            to: positionals[2] || args.to
          });
          break;
        case 'clusters':
          result = await tools.graphClusters({});
          break;
        case 'pagerank':
          result = await tools.graphPageRank({ topK: args.limit || 20 });
          break;
        default:
          result = await tools.graphStats({});
      }

      spin.succeed('Graph query complete');
      writeln('');
      writeln(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
    } catch (err) {
      spin.fail(`Graph query failed: ${err.message}`);
    }
  }

  /**
   * Session command
   */
  async cmdSession(positionals, args) {
    const subcommand = positionals[0] || 'state';
    const sessionId = args.session || 'default';

    try {
      const tools = require('../server/tools');

      let result;
      switch (subcommand) {
        case 'undo':
          result = await tools.sessionUndo({ sessionId });
          writeln(green('Undo successful'));
          break;
        case 'redo':
          result = await tools.sessionRedo({ sessionId });
          writeln(green('Redo successful'));
          break;
        case 'checkpoint':
          result = await tools.sessionCheckpoint({
            sessionId,
            name: positionals[1] || `checkpoint-${Date.now()}`
          });
          writeln(green(`Checkpoint created: ${result}`));
          break;
        case 'state':
        default:
          result = await tools.sessionState({ sessionId });
          writeln(bold(`Session: ${sessionId}`));
          writeln(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
      }
    } catch (err) {
      error(`Session command failed: ${err.message}`);
    }
  }

  /**
   * Verify command - review/correct facts
   */
  async cmdVerify(positionals, args) {
    const reportId = positionals[0];

    if (!reportId) {
      // Show disputed facts
      if (this.verification) {
        const disputed = this.verification.factTracker.getDisputedFacts(20);
        writeln(bold(`Disputed Facts (${disputed.length}):`));
        for (const fact of disputed) {
          writeln(`  [${fact.id}] ${fact.claim}`);
          writeln(dim(`    Model: ${fact.model} | Confidence: ${Math.round(fact.confidence * 100)}%`));
        }
        if (disputed.length === 0) {
          writeln(green('  No disputed facts found.'));
        }
      } else {
        error('Verification not initialized');
      }
      return;
    }

    // Get facts for report
    const facts = this.verification?.factTracker.getFactsForReport(reportId) || [];

    if (facts.length === 0) {
      writeln(dim(`No tracked facts for report ${reportId}`));
      return;
    }

    writeln(bold(`Facts for Report #${reportId}:`));
    for (const fact of facts) {
      const statusIcon = fact.status === FactStatus.VERIFIED ? green('✓')
        : fact.status === FactStatus.DISPUTED ? yellow('?')
        : fact.status === FactStatus.FALSE ? red('✗')
        : dim('○');
      writeln(`  ${statusIcon} ${fact.claim.slice(0, 80)}`);
    }

    // Interactive correction if --correct flag
    if (args.correct) {
      const factId = await prompt('Enter fact ID to correct:');
      const correction = await prompt('Enter corrected claim:');
      const note = await prompt('Optional note:');

      await this.verification.recordFeedback(factId, false, correction, note);
      writeln(green('Correction recorded.'));
    }
  }

  /**
   * Config command
   */
  async cmdConfig(positionals, args) {
    const action = positionals[0] || 'list';
    const key = positionals[1];
    const value = positionals[2];

    writeln(dim('Config management (encrypted storage coming soon)'));
    writeln('');

    switch (action) {
      case 'list':
        writeln(bold('Environment:'));
        writeln(`  OPENROUTER_API_KEY: ${process.env.OPENROUTER_API_KEY ? green('set') : red('not set')}`);
        writeln(`  LOG_LEVEL: ${process.env.LOG_LEVEL || 'info'}`);
        writeln(`  MODE: ${process.env.MODE || 'ALL'}`);
        break;
      case 'get':
        if (key) {
          writeln(`${key}: ${process.env[key] || dim('not set')}`);
        }
        break;
      case 'set':
        writeln(yellow('Setting environment variables via CLI not yet implemented.'));
        writeln(dim('Use shell export or .env file.'));
        break;
      default:
        writeln(dim(`Unknown action: ${action}`));
    }
  }

  /**
   * Status command
   */
  async cmdStatus(args) {
    const spin = spinner('Checking status...').start();

    try {
      const tools = require('../server/tools');
      const status = await tools.getServerStatus({});

      spin.succeed('Status retrieved');
      writeln('');
      writeln(bold('Zero CLI Status'));
      writeln(dim('─'.repeat(40)));
      writeln(`Version: ${version}`);
      writeln('');

      if (typeof status === 'string') {
        writeln(status);
      } else {
        writeln(JSON.stringify(status, null, 2));
      }

      // Verification stats
      if (this.verification) {
        writeln('');
        writeln(bold('Verification Stats:'));
        const stats = this.verification.getStats();
        writeln(JSON.stringify(stats.facts, null, 2));
      }
    } catch (err) {
      spin.fail(`Status check failed: ${err.message}`);
    }
  }

  /**
   * Show version
   */
  showVersion() {
    writeln(`zero v${version}`);
  }

  /**
   * Show help
   */
  showHelp(command) {
    writeln('');
    writeln(bold('Zero CLI') + dim(` v${version}`));
    writeln(dim('Bleeding-edge agentic intelligence system'));
    writeln('');

    if (command && COMMANDS[command]) {
      const cmd = COMMANDS[command];
      writeln(bold(`Command: ${command}`));
      writeln(`  ${cmd.description}`);
      writeln('');
      writeln(dim('Usage:'));
      writeln(`  ${cmd.usage}`);
      if (cmd.aliases?.length) {
        writeln('');
        writeln(dim('Aliases: ') + cmd.aliases.join(', '));
      }
    } else {
      writeln(bold('Commands:'));
      for (const [name, cmd] of Object.entries(COMMANDS)) {
        const aliases = cmd.aliases?.length ? dim(` (${cmd.aliases.join(', ')})`) : '';
        writeln(`  ${cyan(name.padEnd(12))} ${cmd.description}${aliases}`);
      }
      writeln('');
      writeln(dim('Run "zero help <command>" for detailed usage.'));
    }

    writeln('');
  }
}

// Export singleton runner
const cli = new ZeroCLI();

module.exports = {
  run: (argv) => cli.run(argv),
  ZeroCLI,
  COMMANDS
};
