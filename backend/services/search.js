const { dbAll, dbGet, dbExec } = require('../db/database');

const buildFilters = ({ projectId, conversationId, role, from, to }, { alias }) => {
  const clauses = [];
  const params = [];

  if (projectId) {
    clauses.push(`${alias}.project_id = ?`);
    params.push(Number(projectId));
  }

  if (conversationId) {
    clauses.push(`${alias}.conversation_id = ?`);
    params.push(Number(conversationId));
  }

  if (role) {
    clauses.push(`${alias}.role = ?`);
    params.push(role);
  }

  if (from) {
    clauses.push(`${alias}.created_at >= ?`);
    params.push(from);
  }

  if (to) {
    clauses.push(`${alias}.created_at <= ?`);
    params.push(to);
  }

  return {
    where: clauses.length ? `AND ${clauses.join(' AND ')}` : '',
    params,
  };
};

const ensureSearchIndex = async () => {
  const table = await dbGet(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'message_fts'"
  );

  if (table?.sql?.includes("content='messages'")) {
    await dbExec('DROP TRIGGER IF EXISTS messages_ai;');
    await dbExec('DROP TRIGGER IF EXISTS messages_ad;');
    await dbExec('DROP TRIGGER IF EXISTS messages_au;');
    await dbExec('DROP TABLE IF EXISTS message_fts;');
  }

  await dbExec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS message_fts USING fts5(
      content,
      role UNINDEXED,
      conversation_id UNINDEXED,
      project_id UNINDEXED,
      created_at UNINDEXED
    );
  `);

  await dbExec(`
    CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
      INSERT INTO message_fts(rowid, content, role, conversation_id, project_id, created_at)
      VALUES (
        new.id,
        new.content,
        new.role,
        new.conversation_id,
        COALESCE((SELECT project_id FROM conversations WHERE id = new.conversation_id), 0),
        new.created_at
      );
    END;
  `);

  await dbExec(`
    CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
      DELETE FROM message_fts WHERE rowid = old.id;
    END;
  `);

  await dbExec(`
    CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
      DELETE FROM message_fts WHERE rowid = old.id;
      INSERT INTO message_fts(rowid, content, role, conversation_id, project_id, created_at)
      VALUES (
        new.id,
        new.content,
        new.role,
        new.conversation_id,
        COALESCE((SELECT project_id FROM conversations WHERE id = new.conversation_id), 0),
        new.created_at
      );
    END;
  `);

  const count = await dbGet('SELECT COUNT(*) as count FROM message_fts');
  if (!count?.count) {
    await dbExec(`
      INSERT INTO message_fts(rowid, content, role, conversation_id, project_id, created_at)
      SELECT m.id, m.content, m.role, m.conversation_id, COALESCE(c.project_id, 0), m.created_at
      FROM messages m
      LEFT JOIN conversations c ON c.id = m.conversation_id;
    `);
  }
};

const searchHistory = async ({ query, projectId, conversationId, role, from, to, limit = 20 }) => {
  const term = String(query || '').trim();
  if (!term) return [];

  await ensureSearchIndex();

  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const ftsFilters = buildFilters({ projectId, conversationId, role, from, to }, { alias: 'fts' });

  try {
    return await dbAll(
      `SELECT
         m.id,
         m.conversation_id,
         m.role,
         m.content,
         m.created_at,
         c.title as conversation_title,
         c.project_id,
         snippet(message_fts, 0, '[', ']', ' ... ', 18) as snippet,
         bm25(message_fts) as score
       FROM message_fts fts
       JOIN messages m ON m.id = fts.rowid
       JOIN conversations c ON c.id = m.conversation_id
       WHERE message_fts MATCH ? ${ftsFilters.where}
       ORDER BY score, m.created_at DESC
       LIMIT ?`,
      [term, ...ftsFilters.params, safeLimit]
    );
  } catch (error) {
    const likeTerm = `%${term}%`;
    const fallbackFilters = buildFilters({ projectId, conversationId, role, from, to }, { alias: 'm' });
    return dbAll(
      `SELECT
         m.id,
         m.conversation_id,
         m.role,
         m.content,
         m.created_at,
         c.title as conversation_title,
         c.project_id,
         m.content as snippet,
         0 as score
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE m.content LIKE ? ${fallbackFilters.where.replace(/m\.project_id/g, 'c.project_id')}
       ORDER BY m.created_at DESC
       LIMIT ?`,
      [likeTerm, ...fallbackFilters.params, safeLimit]
    );
  }
};

module.exports = {
  searchHistory,
  ensureSearchIndex,
};
