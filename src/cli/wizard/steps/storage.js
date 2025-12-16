/**
 * Step 4: Storage Configuration
 *
 * - Data directory location
 * - In-memory vs persistent storage
 * - Database initialization
 *
 * @module cli/wizard/steps/storage
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Get default data directory
 */
function getDefaultDataDir() {
  // Use XDG_DATA_HOME on Linux, ~/Library on macOS, %APPDATA% on Windows
  const platform = os.platform();

  if (platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'zero');
  } else if (platform === 'win32') {
    return path.join(process.env.APPDATA || os.homedir(), 'zero');
  } else {
    // Linux and others - use XDG
    const xdgData = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
    return path.join(xdgData, 'zero');
  }
}

/**
 * Check if a directory is writable
 */
function isWritable(dirPath) {
  try {
    const testFile = path.join(dirPath, '.write-test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    return true;
  } catch {
    return false;
  }
}

/**
 * Run the storage configuration step
 */
async function run(rl, ask, askYesNo) {
  console.log('');
  console.log('  Configure where Zero stores data.');
  console.log('');

  const config = {
    dataDir: null,
    inMemory: false,
  };

  // Ask about storage mode
  console.log('  Storage options:');
  console.log('  1. Persistent (recommended) - Data saved to disk');
  console.log('  2. In-memory - Data lost on restart (faster, no disk usage)');
  console.log('');

  const usePersistent = await askYesNo(rl, 'Use persistent storage?', true);

  if (!usePersistent) {
    config.inMemory = true;
    console.log('\n  Using in-memory storage. Data will not persist between sessions.');
    return config;
  }

  // Get data directory
  const defaultDir = getDefaultDataDir();
  console.log('');
  console.log(`  Default location: ${defaultDir}`);

  const useDefault = await askYesNo(rl, 'Use default location?', true);

  if (useDefault) {
    config.dataDir = defaultDir;
  } else {
    const customDir = await ask(rl, 'Enter custom data directory path');
    config.dataDir = customDir || defaultDir;
  }

  // Resolve and validate path
  config.dataDir = path.resolve(config.dataDir);

  // Create directory if needed
  if (!fs.existsSync(config.dataDir)) {
    const create = await askYesNo(rl, `Create directory ${config.dataDir}?`, true);
    if (create) {
      try {
        fs.mkdirSync(config.dataDir, { recursive: true });
        console.log(`  \x1b[32mCreated: ${config.dataDir}\x1b[0m`);
      } catch (e) {
        console.log(`  \x1b[31mFailed to create directory: ${e.message}\x1b[0m`);
        console.log('  Falling back to in-memory storage.');
        config.inMemory = true;
        return config;
      }
    } else {
      console.log('  Falling back to in-memory storage.');
      config.inMemory = true;
      return config;
    }
  }

  // Check writability
  if (!isWritable(config.dataDir)) {
    console.log(`  \x1b[31mDirectory not writable: ${config.dataDir}\x1b[0m`);
    console.log('  Falling back to in-memory storage.');
    config.inMemory = true;
    return config;
  }

  console.log(`\n  Data will be stored in: ${config.dataDir}`);

  // Show estimated storage info
  const estimatedSize = '~100MB for typical usage';
  console.log(`  Estimated storage: ${estimatedSize}`);

  return config;
}

module.exports = {
  run,
  getDefaultDataDir,
  isWritable,
};
