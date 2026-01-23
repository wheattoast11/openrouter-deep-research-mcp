const dbClient = require('./src/utils/dbClient');

async function find36() {
  try {
    console.log('Initializing DB...');
    await dbClient.initDB();
    console.log('DB Initialized.');
    
    const res = await dbClient.executeQuery('SELECT id, original_query, accuracy_score, fact_check_results FROM research_reports WHERE fact_check_results IS NOT NULL ORDER BY created_at DESC');
    console.log(`Found ${res.rows.length} reports with fact checks.`);
    
    for (const row of res.rows) {
      const results = typeof row.fact_check_results === 'string' ? JSON.parse(row.fact_check_results) : row.fact_check_results;
      const disputes = results?.filter(f => f.status === 'disputed' || f.status === 'false')?.length || 0;
      console.log(`Report #${row.id}: ${disputes} disputes - Query: ${row.original_query.slice(0, 100)}`);
      if (disputes >= 30) {
        console.log('FOUND IT!');
        console.log('Full Query:', row.original_query);
        break;
      }
    }
  } catch (e) {
    console.error('Error:', e);
  } finally {
    process.exit(0);
  }
}

find36();
