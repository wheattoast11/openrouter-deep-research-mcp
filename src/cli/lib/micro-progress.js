/**
 * micro-progress.js - Zero-dependency spinner and progress bar
 *
 * Provides:
 * - Animated spinner with customizable frames
 * - Progress bar with percentage
 * - Status updates
 *
 * ~60 lines, no external dependencies.
 */

'use strict';

const { cursor, screen, cyan, green, gray, dim } = require('./micro-term');

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const PROGRESS_WIDTH = 30;

class Spinner {
  constructor(text = '') {
    this.text = text;
    this.frameIndex = 0;
    this.interval = null;
    this.active = false;
  }

  start(text) {
    if (text) this.text = text;
    if (!process.stdout.isTTY) {
      process.stdout.write(`${this.text}...\n`);
      return this;
    }

    this.active = true;
    cursor.hide();
    this.render();
    this.interval = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % SPINNER_FRAMES.length;
      this.render();
    }, 80);
    return this;
  }

  render() {
    screen.clearLine();
    cursor.toColumn(1);
    process.stdout.write(`${cyan(SPINNER_FRAMES[this.frameIndex])} ${this.text}`);
  }

  update(text) {
    this.text = text;
    if (this.active && process.stdout.isTTY) this.render();
    return this;
  }

  stop(finalText, success = true) {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.active = false;

    if (process.stdout.isTTY) {
      screen.clearLine();
      cursor.toColumn(1);
      cursor.show();
    }

    if (finalText) {
      const symbol = success ? green('✓') : '\x1b[31m✗\x1b[0m';
      process.stdout.write(`${symbol} ${finalText}\n`);
    }
    return this;
  }

  succeed(text) { return this.stop(text || this.text, true); }
  fail(text) { return this.stop(text || this.text, false); }
}

class ProgressBar {
  constructor(total, text = '') {
    this.total = total;
    this.current = 0;
    this.text = text;
  }

  update(current, text) {
    this.current = Math.min(current, this.total);
    if (text) this.text = text;
    this.render();
    return this;
  }

  increment(text) {
    return this.update(this.current + 1, text);
  }

  render() {
    if (!process.stdout.isTTY) return;

    const percent = this.total > 0 ? this.current / this.total : 0;
    const filled = Math.round(PROGRESS_WIDTH * percent);
    const empty = PROGRESS_WIDTH - filled;
    const bar = green('█'.repeat(filled)) + dim('░'.repeat(empty));
    const pct = gray(`${Math.round(percent * 100)}%`);

    screen.clearLine();
    cursor.toColumn(1);
    process.stdout.write(`${bar} ${pct} ${this.text}`);
  }

  done(text) {
    this.current = this.total;
    this.render();
    process.stdout.write('\n');
    if (text) process.stdout.write(`${green('✓')} ${text}\n`);
  }
}

function spinner(text) {
  return new Spinner(text);
}

function progress(total, text) {
  return new ProgressBar(total, text);
}

module.exports = { Spinner, ProgressBar, spinner, progress };
