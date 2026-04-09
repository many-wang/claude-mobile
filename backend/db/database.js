const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const dbPath = process.env.DATABASE_PATH || './data/database.sqlite';
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('数据库连接失败:', err);
  } else {
    console.log('数据库连接成功');
  }
});

const dbRun = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
};

const dbGet = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const dbAll = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const dbExec = (sql) => {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
};

const ensureColumn = async (table, column, definition) => {
  const columns = await dbAll(`PRAGMA table_info(${table})`);
  if (!columns.some((item) => item.name === column)) {
    await dbRun(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
};

const ensureFtsTable = async () => {
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

const runMigrations = async () => {
  await ensureColumn('projects', 'metadata_json', 'TEXT');
  await ensureColumn('conversations', 'metadata_json', 'TEXT');
  await ensureColumn('conversations', 'last_summary', 'TEXT');
  await ensureColumn('messages', 'model', 'TEXT');
  await ensureColumn('messages', 'blocks_json', 'TEXT');
  await ensureColumn('messages', 'metadata_json', 'TEXT');

  await dbExec(`
    CREATE TABLE IF NOT EXISTS conversation_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL UNIQUE,
      summary TEXT NOT NULL,
      source_message_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );
  `);

  await dbExec('CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at);');
  await dbExec('CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at);');
  await dbExec('CREATE INDEX IF NOT EXISTS idx_conversation_summaries_conversation ON conversation_summaries(conversation_id);');

  await ensureFtsTable();

  const defaultProjects = await dbAll(
    `SELECT id FROM projects WHERE name = ? ORDER BY id ASC`,
    ['未分类']
  );

  if (defaultProjects.length > 1) {
    const keepId = defaultProjects[0].id;
    const staleIds = defaultProjects.slice(1).map((item) => item.id);
    const placeholders = staleIds.map(() => '?').join(', ');

    await dbRun(
      `UPDATE conversations SET project_id = ? WHERE project_id IN (${placeholders})`,
      [keepId, ...staleIds]
    );
    await dbRun(
      `DELETE FROM projects WHERE id IN (${placeholders})`,
      staleIds
    );
  }

  await dbRun(
    `INSERT INTO projects (name, description)
     SELECT ?, ?
     WHERE NOT EXISTS (SELECT 1 FROM projects WHERE name = ?)`,
    ['未分类', '默认项目，用于存放未分类的对话', '未分类']
  );
  await dbRun(
    `INSERT INTO app_meta (key, value)
     VALUES ('schema_version', '2')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
  );
};

const initDatabase = async () => {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await dbExec(schema);
  await runMigrations();
  console.log('数据库初始化成功');
};

module.exports = {
  db,
  initDatabase,
  dbRun,
  dbGet,
  dbAll,
  dbExec,
};
