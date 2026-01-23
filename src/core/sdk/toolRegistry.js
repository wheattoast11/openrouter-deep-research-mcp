/**
 * Tool Registry Bridge
 *
 * Bridges SDK tool definitions to the terminals.tech Zod schema registry.
 * Enables seamless tool registration and invocation across SDK and native interfaces.
 *
 * @module core/sdk/toolRegistry
 */

'use strict';

const { EventEmitter } = require('events');
const { z } = require('zod');

/**
 * Tool status
 */
const ToolStatus = {
  ACTIVE: 'active',
  DISABLED: 'disabled',
  DEPRECATED: 'deprecated'
};

/**
 * Registered Tool wrapper
 */
class RegisteredTool {
  constructor(name, schema, handler, options = {}) {
    this.name = name;
    this.schema = schema;
    this.handler = handler;
    this.description = options.description || schema?.description || '';
    this.status = options.status || ToolStatus.ACTIVE;
    this.category = options.category || 'general';
    this.aliases = options.aliases || [];
    this.metadata = options.metadata || {};
    this.invocationCount = 0;
    this.lastInvoked = null;
    this.created = Date.now();
  }

  /**
   * Invoke the tool
   *
   * @param {Object} params - Tool parameters
   * @param {Object} [context] - Invocation context
   * @returns {Promise<any>}
   */
  async invoke(params, context = {}) {
    if (this.status !== ToolStatus.ACTIVE) {
      throw new Error(`Tool ${this.name} is ${this.status}`);
    }

    // Validate params if schema exists
    if (this.schema) {
      const result = this.schema.safeParse(params);
      if (!result.success) {
        throw new Error(`Validation failed: ${result.error.message}`);
      }
      params = result.data;
    }

    this.invocationCount++;
    this.lastInvoked = Date.now();

    return this.handler(params, context);
  }

  /**
   * Get tool info
   *
   * @returns {Object}
   */
  getInfo() {
    return {
      name: this.name,
      description: this.description,
      status: this.status,
      category: this.category,
      aliases: this.aliases,
      invocationCount: this.invocationCount,
      lastInvoked: this.lastInvoked,
      hasSchema: !!this.schema
    };
  }
}

/**
 * Tool Registry Bridge
 *
 * Manages tool registrations and provides unified access.
 */
class ToolRegistryBridge extends EventEmitter {
  constructor(options = {}) {
    super();

    this.tools = new Map();
    this.aliases = new Map();
    this.categories = new Map();
    this.nativeRegistry = options.nativeRegistry || null;
    this.logger = options.logger || console;
  }

  /**
   * Register an SDK-style tool
   *
   * @param {string} name - Tool name
   * @param {Object} schema - Zod schema for input validation
   * @param {Function} handler - Tool handler function
   * @param {Object} [options] - Additional options
   * @returns {RegisteredTool}
   */
  register(name, schema, handler, options = {}) {
    const tool = new RegisteredTool(name, schema, handler, options);
    this.tools.set(name, tool);

    // Register aliases
    for (const alias of tool.aliases) {
      this.aliases.set(alias, name);
    }

    // Update category index
    if (!this.categories.has(tool.category)) {
      this.categories.set(tool.category, new Set());
    }
    this.categories.get(tool.category).add(name);

    this.emit('tool-registered', { name, category: tool.category });
    return tool;
  }

  /**
   * Register from SDK tool definition
   *
   * @param {Object} sdkDef - SDK tool definition
   * @returns {RegisteredTool}
   */
  registerFromSDK(sdkDef) {
    const { name, description, input_schema, handler } = sdkDef;

    // Convert SDK input_schema to Zod schema
    const schema = this._sdkSchemaToZod(input_schema);

    return this.register(name, schema, handler, {
      description,
      metadata: { source: 'sdk' }
    });
  }

  /**
   * Get tool by name or alias
   *
   * @param {string} name
   * @returns {RegisteredTool|null}
   */
  getTool(name) {
    // Check direct name
    if (this.tools.has(name)) {
      return this.tools.get(name);
    }

    // Check aliases
    const realName = this.aliases.get(name);
    if (realName) {
      return this.tools.get(realName);
    }

    // Check native registry
    if (this.nativeRegistry?.has?.(name)) {
      return this._wrapNativeTool(name, this.nativeRegistry.get(name));
    }

    return null;
  }

  /**
   * Invoke a tool by name
   *
   * @param {string} name - Tool name
   * @param {Object} params - Tool parameters
   * @param {Object} [context] - Invocation context
   * @returns {Promise<any>}
   */
  async invoke(name, params, context = {}) {
    const tool = this.getTool(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }
    return tool.invoke(params, context);
  }

  /**
   * List all tools
   *
   * @param {Object} [filter] - Filter options
   * @returns {Array<Object>}
   */
  listTools(filter = {}) {
    let tools = Array.from(this.tools.values());

    if (filter.category) {
      tools = tools.filter(t => t.category === filter.category);
    }

    if (filter.status) {
      tools = tools.filter(t => t.status === filter.status);
    }

    return tools.map(t => t.getInfo());
  }

  /**
   * Get tools by category
   *
   * @param {string} category
   * @returns {Array<RegisteredTool>}
   */
  getToolsByCategory(category) {
    const names = this.categories.get(category);
    if (!names) return [];
    return Array.from(names).map(name => this.tools.get(name));
  }

  /**
   * Search tools by description
   *
   * @param {string} query
   * @returns {Array<Object>}
   */
  searchTools(query) {
    const lower = query.toLowerCase();
    return this.listTools().filter(tool =>
      tool.name.toLowerCase().includes(lower) ||
      tool.description.toLowerCase().includes(lower)
    );
  }

  /**
   * Disable a tool
   *
   * @param {string} name
   */
  disable(name) {
    const tool = this.tools.get(name);
    if (tool) {
      tool.status = ToolStatus.DISABLED;
      this.emit('tool-disabled', { name });
    }
  }

  /**
   * Enable a tool
   *
   * @param {string} name
   */
  enable(name) {
    const tool = this.tools.get(name);
    if (tool) {
      tool.status = ToolStatus.ACTIVE;
      this.emit('tool-enabled', { name });
    }
  }

  /**
   * Get registry state
   *
   * @returns {Object}
   */
  getState() {
    const tools = this.listTools();
    return {
      totalTools: tools.length,
      activeTools: tools.filter(t => t.status === ToolStatus.ACTIVE).length,
      categories: Array.from(this.categories.keys()),
      aliasCount: this.aliases.size
    };
  }

  /**
   * Convert SDK schema to Zod schema
   *
   * @private
   * @param {Object} sdkSchema
   * @returns {z.ZodType}
   */
  _sdkSchemaToZod(sdkSchema) {
    if (!sdkSchema) return z.any();

    const { type, properties, required = [] } = sdkSchema;

    if (type === 'object' && properties) {
      const shape = {};
      for (const [key, prop] of Object.entries(properties)) {
        let fieldSchema = this._sdkFieldToZod(prop);
        if (!required.includes(key)) {
          fieldSchema = fieldSchema.optional();
        }
        shape[key] = fieldSchema;
      }
      return z.object(shape);
    }

    return this._sdkFieldToZod(sdkSchema);
  }

  /**
   * Convert SDK field to Zod field
   *
   * @private
   * @param {Object} field
   * @returns {z.ZodType}
   */
  _sdkFieldToZod(field) {
    let schema;

    switch (field.type) {
      case 'string':
        schema = z.string();
        if (field.enum) schema = z.enum(field.enum);
        break;
      case 'number':
      case 'integer':
        schema = z.number();
        if (field.minimum !== undefined) schema = schema.min(field.minimum);
        if (field.maximum !== undefined) schema = schema.max(field.maximum);
        break;
      case 'boolean':
        schema = z.boolean();
        break;
      case 'array':
        const itemSchema = field.items ? this._sdkFieldToZod(field.items) : z.any();
        schema = z.array(itemSchema);
        break;
      case 'object':
        schema = z.record(z.any());
        break;
      default:
        schema = z.any();
    }

    if (field.description) {
      schema = schema.describe(field.description);
    }

    return schema;
  }

  /**
   * Wrap native tool as RegisteredTool
   *
   * @private
   * @param {string} name
   * @param {Object} nativeTool
   * @returns {RegisteredTool}
   */
  _wrapNativeTool(name, nativeTool) {
    return new RegisteredTool(
      name,
      nativeTool.schema,
      nativeTool.handler || nativeTool,
      {
        description: nativeTool.description,
        metadata: { source: 'native' }
      }
    );
  }

  /**
   * Cleanup registry
   */
  destroy() {
    this.tools.clear();
    this.aliases.clear();
    this.categories.clear();
    this.removeAllListeners();
  }
}

/**
 * Create a tool registry bridge
 *
 * @param {Object} [options]
 * @returns {ToolRegistryBridge}
 */
function createToolRegistry(options = {}) {
  return new ToolRegistryBridge(options);
}

module.exports = {
  ToolRegistryBridge,
  RegisteredTool,
  createToolRegistry,
  ToolStatus,
  available: true
};
