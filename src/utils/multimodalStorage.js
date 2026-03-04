/**
 * Multimodal Storage Layer
 * 
 * Handles binary data storage for images, audio, video using BYTEA
 * (alternative to Large Objects which are not available in PGlite)
 */
class MultimodalStorage {
  constructor(dbClient) {
    this.dbClient = dbClient;
  }

  async initialize() {
    await this.dbClient.executeDDL(`
      CREATE TABLE IF NOT EXISTS multimodal_blobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        report_id INTEGER REFERENCES research_reports(id) ON DELETE CASCADE,
        mime_type TEXT NOT NULL,
        file_name TEXT,
        data BYTEA NOT NULL,
        size_bytes INTEGER NOT NULL,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `, []);

    await this.dbClient.executeDDL(`
      CREATE INDEX IF NOT EXISTS idx_multimodal_report ON multimodal_blobs(report_id)
    `, []);

    await this.dbClient.executeDDL(`
      CREATE INDEX IF NOT EXISTS idx_multimodal_mime ON multimodal_blobs(mime_type)
    `, []);
  }

  async storeBlob(reportId, buffer, mimeType, fileName, metadata = {}) {
    const result = await this.dbClient.executeQuery(`
      INSERT INTO multimodal_blobs 
        (report_id, mime_type, file_name, data, size_bytes, metadata)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [reportId, mimeType, fileName, buffer, buffer.length, JSON.stringify(metadata)]);

    return result.rows?.[0]?.id;
  }

  async retrieveBlob(blobId) {
    const result = await this.dbClient.executeQuery(`
      SELECT * FROM multimodal_blobs WHERE id = $1
    `, [blobId]);

    return result.rows?.[0] || null;
  }

  async listBlobsForReport(reportId) {
    const result = await this.dbClient.executeQuery(`
      SELECT id, mime_type, file_name, size_bytes, metadata, created_at
      FROM multimodal_blobs 
      WHERE report_id = $1
      ORDER BY created_at DESC
    `, [reportId]);

    return result.rows || [];
  }
}

module.exports = { MultimodalStorage };
