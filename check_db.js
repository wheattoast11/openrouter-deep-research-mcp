const { PGlite } = require('@electric-sql/pglite');
const path = require('path');

async function check() {
  const dbPath = '/Users/terminals/Library/Application Support/zero';
  console.log('Connecting to:', dbPath);
  const db = new PGlite(dbPath);
  
  try {
    const tables = await db.query(`
      SELECT tablename 
      FROM pg_catalog.pg_tables 
      WHERE schemaname = 'public'
    `);
    console.log('Tables:', JSON.stringify(tables.rows, null, 2));
    
    if (tables.rows.some(t => t.tablename === 'research_reports')) {
      const reports = await db.query('SELECT original_query, accuracy_score, fact_check_results FROM research_reports LIMIT 10');
      console.log('Reports found:', reports.rows.length);
      console.log(JSON.stringify(reports.rows, null, 2));
    } else {
      console.log('research_reports table NOT found in public schema');
    }
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await db.close();
  }
}

check();
