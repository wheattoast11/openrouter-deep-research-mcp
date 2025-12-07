/**
 * micro-prompt.js - Zero-dependency interactive input
 *
 * Provides:
 * - Simple text input with readline
 * - Password input (masked)
 * - Confirmation prompts
 * - Choice selection
 *
 * ~80 lines, no external dependencies.
 */

'use strict';

const readline = require('readline');
const { cyan, yellow, green, dim } = require('./micro-term');

/**
 * Prompt for text input
 * @param {string} question - Prompt text
 * @param {Object} options - Options
 * @param {string} options.default - Default value
 * @param {boolean} options.required - Require non-empty input
 * @returns {Promise<string>}
 */
async function prompt(question, options = {}) {
  const { default: defaultValue, required = false } = options;
  const suffix = defaultValue ? dim(` [${defaultValue}]`) : '';

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(`${cyan('?')} ${question}${suffix}: `, (answer) => {
      rl.close();
      const value = answer.trim() || defaultValue || '';
      if (required && !value) {
        process.stdout.write(yellow('Input required.\n'));
        resolve(prompt(question, options));
      } else {
        resolve(value);
      }
    });
  });
}

/**
 * Prompt for password (masked input)
 */
async function password(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    // Enable raw mode to hide input
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    process.stdout.write(`${cyan('?')} ${question}: `);

    let value = '';
    const onData = (key) => {
      const char = key.toString();

      if (char === '\r' || char === '\n') {
        // Enter pressed
        process.stdin.removeListener('data', onData);
        if (process.stdin.isTTY) process.stdin.setRawMode(false);
        process.stdout.write('\n');
        rl.close();
        resolve(value);
      } else if (char === '\x03') {
        // Ctrl+C
        process.exit(1);
      } else if (char === '\x7f' || char === '\b') {
        // Backspace
        if (value.length > 0) {
          value = value.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else if (char.charCodeAt(0) >= 32) {
        // Printable character
        value += char;
        process.stdout.write('*');
      }
    };

    process.stdin.on('data', onData);
  });
}

/**
 * Confirmation prompt (y/n)
 */
async function confirm(question, defaultValue = false) {
  const suffix = defaultValue ? dim(' [Y/n]') : dim(' [y/N]');
  const answer = await prompt(`${question}${suffix}`, {});

  if (!answer) return defaultValue;
  return /^y(es)?$/i.test(answer);
}

/**
 * Choice selection
 */
async function select(question, choices) {
  process.stdout.write(`${cyan('?')} ${question}\n`);

  choices.forEach((choice, i) => {
    const label = typeof choice === 'object' ? choice.label : choice;
    process.stdout.write(`  ${dim(`${i + 1}.`)} ${label}\n`);
  });

  const answer = await prompt('Select', { default: '1' });
  const index = parseInt(answer, 10) - 1;

  if (index >= 0 && index < choices.length) {
    const selected = choices[index];
    return typeof selected === 'object' ? selected.value : selected;
  }

  process.stdout.write(yellow('Invalid selection.\n'));
  return select(question, choices);
}

module.exports = { prompt, password, confirm, select };
