/**
 * micro-term.js - Zero-dependency ANSI terminal control
 *
 * Provides:
 * - Color output (foreground, background, styles)
 * - Cursor control
 * - Screen clearing
 * - Terminal size detection
 * - Raw mode for interactive input
 *
 * ~100 lines, no external dependencies.
 */

'use strict';

// ANSI escape sequences
const ESC = '\x1b[';
const RESET = `${ESC}0m`;

// Foreground colors
const FG = {
  black: 30, red: 31, green: 32, yellow: 33,
  blue: 34, magenta: 35, cyan: 36, white: 37,
  gray: 90, brightRed: 91, brightGreen: 92, brightYellow: 93,
  brightBlue: 94, brightMagenta: 95, brightCyan: 96, brightWhite: 97
};

// Background colors
const BG = {
  black: 40, red: 41, green: 42, yellow: 43,
  blue: 44, magenta: 45, cyan: 46, white: 47,
  gray: 100, brightRed: 101, brightGreen: 102, brightYellow: 103
};

// Styles
const STYLE = {
  bold: 1, dim: 2, italic: 3, underline: 4,
  blink: 5, inverse: 7, hidden: 8, strikethrough: 9
};

/**
 * Apply color/style to text
 * @param {string} text - Text to style
 * @param {...string} styles - Styles to apply
 */
function style(text, ...styles) {
  if (!process.stdout.isTTY && !process.env.FORCE_COLOR) {
    return text; // No color in non-TTY unless forced
  }

  const codes = styles.map(s => {
    if (FG[s] !== undefined) return FG[s];
    if (BG[s] !== undefined) return BG[s];
    if (STYLE[s] !== undefined) return STYLE[s];
    return null;
  }).filter(Boolean);

  if (codes.length === 0) return text;
  return `${ESC}${codes.join(';')}m${text}${RESET}`;
}

// Convenience color functions
const red = (t) => style(t, 'red');
const green = (t) => style(t, 'green');
const yellow = (t) => style(t, 'yellow');
const blue = (t) => style(t, 'blue');
const cyan = (t) => style(t, 'cyan');
const gray = (t) => style(t, 'gray');
const bold = (t) => style(t, 'bold');
const dim = (t) => style(t, 'dim');

// Cursor control
const cursor = {
  hide: () => process.stdout.write(`${ESC}?25l`),
  show: () => process.stdout.write(`${ESC}?25h`),
  move: (x, y) => process.stdout.write(`${ESC}${y};${x}H`),
  up: (n = 1) => process.stdout.write(`${ESC}${n}A`),
  down: (n = 1) => process.stdout.write(`${ESC}${n}B`),
  right: (n = 1) => process.stdout.write(`${ESC}${n}C`),
  left: (n = 1) => process.stdout.write(`${ESC}${n}D`),
  save: () => process.stdout.write(`${ESC}s`),
  restore: () => process.stdout.write(`${ESC}u`),
  toColumn: (n) => process.stdout.write(`${ESC}${n}G`)
};

// Screen control
const screen = {
  clear: () => process.stdout.write(`${ESC}2J${ESC}H`),
  clearLine: () => process.stdout.write(`${ESC}2K`),
  clearToEnd: () => process.stdout.write(`${ESC}0K`),
  clearToStart: () => process.stdout.write(`${ESC}1K`)
};

/**
 * Get terminal size
 */
function getSize() {
  return {
    columns: process.stdout.columns || 80,
    rows: process.stdout.rows || 24
  };
}

/**
 * Write text with newline
 */
function writeln(text = '') {
  process.stdout.write(text + '\n');
}

/**
 * Write text without newline
 */
function write(text) {
  process.stdout.write(text);
}

/**
 * Write to stderr
 */
function error(text) {
  process.stderr.write(red(text) + '\n');
}

module.exports = {
  style, FG, BG, STYLE, RESET, ESC,
  red, green, yellow, blue, cyan, gray, bold, dim,
  cursor, screen, getSize, writeln, write, error
};
