/**
 * Deterministic JSON stringification for structural integrity.
 * Used for L1 Isomorphism (shapeHash).
 */

/**
 * Recursively sort object keys for canonical representation
 * @param {*} obj - Any value to canonicalize
 * @returns {*} Canonical version of the input
 */
function canonicalize(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(canonicalize);
  }
  
  const keys = Object.keys(obj).sort();
  const result = {};
  for (const key of keys) {
    result[key] = canonicalize(obj[key]);
  }
  return result;
}

/**
 * Deterministic JSON.stringify
 * @param {*} obj 
 * @returns {string}
 */
function deterministicStringify(obj) {
  return JSON.stringify(canonicalize(obj));
}

module.exports = {
  canonicalize,
  deterministicStringify
};
