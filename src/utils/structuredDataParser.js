// src/utils/structuredDataParser.js
const { parse } = require('csv-parse/sync');

/**
 * Parses CSV content and returns an array of objects.
 * @param {string} csvContent - The CSV content as a string.
 * @returns {Array<Object>|null} Parsed data or null on error.
 */
function parseCsv(csvContent) {
  try {
    const records = parse(csvContent, {
      columns: true, // Use the first row as headers
      skip_empty_lines: true,
      trim: true,
    });
    return records;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] structuredDataParser: Error parsing CSV:`, error.message);
    return null;
  }
}

/**
 * Parses JSON content.
 * @param {string} jsonContent - The JSON content as a string.
 * @returns {Object|Array|null} Parsed JSON object/array or null on error.
 */
function parseJson(jsonContent) {
  try {
    return JSON.parse(jsonContent);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] structuredDataParser: Error parsing JSON:`, error.message);
    return null;
  }
}

/**
 * Provides a summary of structured data (CSV or JSON).
 * @param {string} content - The raw string content.
 * @param {'csv'|'json'} type - The type of the data.
 * @param {string} name - The name/identifier of the data.
 * @param {number} sampleSize - Number of rows/elements to include in the sample.
 * @returns {string} A summary string or an error message.
 */
function getStructuredDataSummary(content, type, name, sampleSize = 5) {
  let summary = `Summary for ${type.toUpperCase()} data "${name}":\n`;
  let data;

  if (type === 'csv') {
    data = parseCsv(content);
    if (!data) return summary + "Error: Failed to parse CSV content.";
    
    const rowCount = data.length;
    const headers = data.length > 0 ? Object.keys(data[0]) : [];
    summary += `- Total Rows: ${rowCount}\n`;
    summary += `- Headers: ${headers.join(', ')}\n`;
    summary += `- Sample Rows (${Math.min(sampleSize, rowCount)}):\n`;
    summary += JSON.stringify(data.slice(0, sampleSize), null, 2); // Pretty print sample

  } else if (type === 'json') {
    data = parseJson(content);
    if (!data) return summary + "Error: Failed to parse JSON content.";

    if (Array.isArray(data)) {
      const elementCount = data.length;
      summary += `- Type: Array\n`;
      summary += `- Total Elements: ${elementCount}\n`;
      if (elementCount > 0 && typeof data[0] === 'object' && data[0] !== null) {
         summary += `- Keys in first element: ${Object.keys(data[0]).join(', ')}\n`;
      }
      summary += `- Sample Elements (${Math.min(sampleSize, elementCount)}):\n`;
      summary += JSON.stringify(data.slice(0, sampleSize), null, 2);
    } else if (typeof data === 'object' && data !== null) {
      const keys = Object.keys(data);
      summary += `- Type: Object\n`;
      summary += `- Top-level Keys (${keys.length}): ${keys.slice(0, 10).join(', ')}${keys.length > 10 ? '...' : ''}\n`;
      // Sample values for the first few keys
      summary += `- Sample Key-Values:\n`;
      const sampleKeys = keys.slice(0, sampleSize);
      const sample = {};
      sampleKeys.forEach(key => { sample[key] = data[key]; });
      summary += JSON.stringify(sample, null, 2);
    } else {
      summary += `- Type: Primitive\n`;
      summary += `- Value: ${JSON.stringify(data)}`;
    }
  } else {
    return `Error: Unsupported data type "${type}" for summary.`;
  }

  return summary;
}


module.exports = {
  parseCsv,
  parseJson,
  getStructuredDataSummary,
};
