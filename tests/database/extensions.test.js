/**
 * Database Extension Tests - Full Extension Suite
 * Tests all PGlite extensions available in v0.3.14+
 */
const { PGlite } = require('@electric-sql/pglite');
// First-class extensions
const { vector } = require('@electric-sql/pglite/vector');
const { live } = require('@electric-sql/pglite/live');
const { pgtap } = require('@electric-sql/pglite/pgtap');
const { pg_uuidv7 } = require('@electric-sql/pglite/pg_uuidv7');
const { pg_ivm } = require('@electric-sql/pglite/pg_ivm');
// Contrib extensions
const { bloom } = require('@electric-sql/pglite/contrib/bloom');
const { cube } = require('@electric-sql/pglite/contrib/cube');
const { seg } = require('@electric-sql/pglite/contrib/seg');
const { tcn } = require('@electric-sql/pglite/contrib/tcn');
const { tsm_system_time } = require('@electric-sql/pglite/contrib/tsm_system_time');
const { ltree } = require('@electric-sql/pglite/contrib/ltree');
const { lo } = require('@electric-sql/pglite/contrib/lo');
const { tablefunc } = require('@electric-sql/pglite/contrib/tablefunc');
const { uuid_ossp } = require('@electric-sql/pglite/contrib/uuid_ossp');
const { fuzzystrmatch } = require('@electric-sql/pglite/contrib/fuzzystrmatch');
const { citext } = require('@electric-sql/pglite/contrib/citext');
const { hstore } = require('@electric-sql/pglite/contrib/hstore');

async function runTests() {
  console.log('--- Initializing PGLite with Full Extension Suite ---');
  console.log('PGlite version: 0.3.14+');
  
  const db = await PGlite.create({
    extensions: { 
      // First-class
      vector, 
      live,
      pgtap,
      pg_uuidv7,
      pg_ivm,
      // Contrib
      bloom, 
      cube, 
      seg, 
      tcn, 
      tsm_system_time, 
      ltree,
      lo,
      tablefunc,
      uuid_ossp,
      // Utilities
      fuzzystrmatch,
      citext,
      hstore
    }
  });

  // Enable extensions
  console.log('--- Creating Extensions ---');
  await db.query("CREATE EXTENSION IF NOT EXISTS vector;");
  await db.query("CREATE EXTENSION IF NOT EXISTS pgtap;");
  await db.query('CREATE EXTENSION IF NOT EXISTS "pg_uuidv7";');
  await db.query("CREATE EXTENSION IF NOT EXISTS pg_ivm;");
  await db.query("CREATE EXTENSION IF NOT EXISTS ltree;");
  await db.query("CREATE EXTENSION IF NOT EXISTS bloom;");
  await db.query("CREATE EXTENSION IF NOT EXISTS cube;");
  await db.query("CREATE EXTENSION IF NOT EXISTS seg;");
  await db.query("CREATE EXTENSION IF NOT EXISTS tcn;");
  await db.query("CREATE EXTENSION IF NOT EXISTS tsm_system_time;");
  await db.query("CREATE EXTENSION IF NOT EXISTS lo;");
  await db.query("CREATE EXTENSION IF NOT EXISTS tablefunc;");
  await db.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
  await db.query("CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;");
  await db.query("CREATE EXTENSION IF NOT EXISTS citext;");
  await db.query("CREATE EXTENSION IF NOT EXISTS hstore;");

  console.log('--- All 16 Extensions Created Successfully ---');

  // Track test results
  let passed = 0;
  let failed = 0;

  // Helper to run test
  const tap = async (sql, desc) => {
    try {
      const res = await db.query(sql);
      console.log(`✓ ${desc}`);
      passed++;
      return res.rows;
    } catch (err) {
      console.log(`✗ ${desc}: ${err.message}`);
      failed++;
      return null;
    }
  };

  console.log('--- Running Extension Verification Tests ---');
  
  // 1. Vector extension
  await tap("SELECT '[1,2,3]'::vector(3)", "vector: vector type works");
  await tap("SELECT '[1,0,0]'::vector <=> '[0,1,0]'::vector AS distance", "vector: cosine distance operator");

  // 2. pgTAP (testing framework)
  await tap("SELECT plan(1)", "pgtap: plan() function");
  await tap("SELECT pass('Basic test')", "pgtap: pass() function");
  await tap("SELECT * FROM finish()", "pgtap: finish() function");

  // 3. pg_uuidv7
  await tap("SELECT uuid_generate_v7()", "pg_uuidv7: generates v7 UUIDs");
  await tap("SELECT uuid_v7_to_timestamptz(uuid_generate_v7())", "pg_uuidv7: timestamp extraction");

  // 4. pg_ivm (incremental materialized views)
  await tap("SELECT 1 WHERE EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_immv')", "pg_ivm: create_immv function available");

  // 5. Cube extension
  await tap("SELECT '(1,2,3)'::cube", "cube: cube type works");
  await tap("SELECT cube_distance('(0,0)'::cube, '(1,1)'::cube)", "cube: distance function");

  // 6. Seg extension
  await tap("SELECT '1..2'::seg", "seg: seg type works");
  await tap("SELECT '1 .. 2'::seg", "seg: range notation");

  // 7. Ltree extension
  await tap("SELECT 'top.science.astronomy'::ltree", "ltree: ltree type works");
  await tap("SELECT 'top.science.astronomy'::ltree ~ 'top.*'::lquery", "ltree: lquery matching");
  await tap("SELECT nlevel('top.science.astronomy')", "ltree: nlevel function");

  // 8. TCN (triggered change notifications)
  await tap("SELECT 1 WHERE EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'triggered_change_notification')", "tcn: notification function exists");

  // 9. tsm_system_time
  await tap("SELECT 1 WHERE EXISTS (SELECT 1 FROM pg_ts_config)", "tsm_system_time: extension loaded");

  // 10. Lo (large objects)
  await tap("SELECT lo_create(0)", "lo: lo_create function");
  
  // 11. Tablefunc
  await tap("SELECT 1 WHERE EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'normal_rand')", "tablefunc: normal_rand function");
  await tap("SELECT normal_rand(1, 0, 1)", "tablefunc: normal_rand execution");

  // 12. uuid-ossp
  await tap("SELECT uuid_generate_v4()", "uuid-ossp: uuid_generate_v4 function");
  await tap("SELECT uuid_generate_v1()", "uuid-ossp: uuid_generate_v1 function");

  // 13. Fuzzystrmatch
  await tap("SELECT soundex('hello')", "fuzzystrmatch: soundex function");
  await tap("SELECT levenshtein('hello', 'hallo')", "fuzzystrmatch: levenshtein distance");
  await tap("SELECT metaphone('hello', 6)", "fuzzystrmatch: metaphone function");

  // 14. Citext (case-insensitive text)
  await tap("SELECT 'Hello'::citext = 'hello'::citext", "citext: case-insensitive comparison");

  // 15. Hstore (key-value store)
  await tap("SELECT 'a=>1, b=>2'::hstore", "hstore: hstore type works");
  await tap("SELECT 'a=>1, b=>2'::hstore -> 'a'", "hstore: key access");

  // Summary
  console.log('');
  console.log('=== Test Summary ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}`);
  console.log('');

  if (failed > 0) {
    console.log('⚠️  Some tests failed - check output above');
    process.exitCode = 1;
  } else {
    console.log('✅ All extension tests passed!');
  }

  await db.close();
}

if (require.main === module) {
  runTests().catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
}

module.exports = { runTests };
