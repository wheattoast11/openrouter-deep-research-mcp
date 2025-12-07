/**
 * micro-args.js - Zero-dependency argument parser
 *
 * Supports:
 * - Positional arguments
 * - Flags: --flag, -f
 * - Key-value: --key=value, --key value, -k value
 * - Boolean coercion: --no-verify → verify: false
 * - Aliases: -v → --verbose
 * - Subcommands: zero research "query"
 *
 * ~80 lines, no external dependencies.
 */

'use strict';

/**
 * Parse command line arguments
 * @param {string[]} argv - Arguments (typically process.argv.slice(2))
 * @param {Object} options - Parser options
 * @param {Object} options.aliases - Map short flags to long names {v: 'verbose'}
 * @param {string[]} options.boolean - Flags that are always boolean
 * @param {Object} options.defaults - Default values
 * @returns {Object} Parsed arguments {_: positionals, ...flags}
 */
function parse(argv, options = {}) {
  const { aliases = {}, boolean = [], defaults = {} } = options;
  const result = { _: [], ...defaults };

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];

    if (arg === '--') {
      // Everything after -- is positional
      result._.push(...argv.slice(i + 1));
      break;
    }

    if (arg.startsWith('--no-')) {
      // --no-verify → verify: false
      const key = camelCase(arg.slice(5));
      result[key] = false;
      i++;
      continue;
    }

    if (arg.startsWith('--')) {
      const eqIndex = arg.indexOf('=');
      if (eqIndex !== -1) {
        // --key=value
        const key = camelCase(arg.slice(2, eqIndex));
        result[key] = coerce(arg.slice(eqIndex + 1));
      } else {
        // --key value or --flag
        const key = camelCase(arg.slice(2));
        if (boolean.includes(key) || i + 1 >= argv.length || argv[i + 1].startsWith('-')) {
          result[key] = true;
        } else {
          result[key] = coerce(argv[++i]);
        }
      }
      i++;
      continue;
    }

    if (arg.startsWith('-') && arg.length > 1) {
      // -f or -f value or -abc (multiple flags)
      const flags = arg.slice(1);
      if (flags.length === 1) {
        const key = aliases[flags] || flags;
        if (boolean.includes(key) || i + 1 >= argv.length || argv[i + 1].startsWith('-')) {
          result[key] = true;
        } else {
          result[key] = coerce(argv[++i]);
        }
      } else {
        // Multiple short flags: -abc → a: true, b: true, c: true
        for (const flag of flags) {
          const key = aliases[flag] || flag;
          result[key] = true;
        }
      }
      i++;
      continue;
    }

    // Positional argument
    result._.push(arg);
    i++;
  }

  return result;
}

/**
 * Convert kebab-case to camelCase
 */
function camelCase(str) {
  return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * Coerce string values to appropriate types
 */
function coerce(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (/^-?\d+$/.test(value)) return parseInt(value, 10);
  if (/^-?\d*\.\d+$/.test(value)) return parseFloat(value);
  return value;
}

module.exports = { parse, camelCase, coerce };
