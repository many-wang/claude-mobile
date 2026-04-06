const express = require('express');
const router = express.Router();
const { dbRun, dbGet, dbAll } = require('../db/database');
const { sendMessage } = require('../services/claude');

// 创建新对话
router.post('/conversations', async (req, res) => {
  try {
    const { project_id, title } = req.body;

    if (!title) {
      return res.status(400).json({ error: '对话标题不能为空' });
    }

    const result = await dbRun(
      'INSERT INTO conversations (project_id, title) VALUES (?, ?)',
      [project_id || null, title]
    );

    const conversation = await dbGet(
      'SELECT * FROM conversations WHERE id = ?',
      [result.id]
    );

    res.json({ conversation });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取对话详情（包含所有消息）
router.get('/conversations/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const conversation = await dbGet(
      'SELECT * FROM conversations WHERE id = ?',
      [id]
    );

    if (!conversation) {
      return res.status(404).json({ error: '对话不存在' });
    }

    const messages = await dbAll(
      'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
      [id]
    );

    res.json({ conversation, messages });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 发送消息并获取 Claude 回复
router.post('/conversations/:id/messages', async (req, res) => {
  try {
    const { id } = req.params;
    const { content, model } = req.body;

    if (!content) {
      return res.status(400).json({ error: '消息内容不能为空' });
    }

    // 检查对话是否存在
    const conversation = await dbGet(
      'SELECT * FROM conversations WHERE id = ?',
      [id]
    );

    if (!conversation) {
      return res.status(404).json({ error: '对话不存在' });
    }

    // 保存用户消息
    const userResult = await dbRun(
      'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)',
      [id, 'user', content]
    );

    const userMessage = await dbGet(
      'SELECT * FROM messages WHERE id = ?',
      [userResult.id]
    );

    // 获取历史消息
    const history = await dbAll(
      'SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
      [id]
    );

    // 调用 Claude API
    const assistantContent = await sendMessage(history, model);

    // 保存 Claude 回复
    const assistantResult = await dbRun(
      'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)',
      [id, 'assistant', assistantContent]
    );

    const assistantMessage = await dbGet(
      'SELECT * FROM messages WHERE id = ?',
      [assistantResult.id]
    );

    // 更新对话的 updated_at
    await dbRun(
      'UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [id]
    );

    res.json({ userMessage, assistantMessage });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 导出对话为 Markdown
router.get('/conversations/:id/export', async (req, res) => {
  try {
    const { id } = req.params;

    const conversation = await dbGet(
      'SELECT * FROM conversations WHERE id = ?',
      [id]
    );

    if (!conversation) {
      return res.status(404).json({ error: '对话不存在' });
    }

    const messages = await dbAll(
      'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
      [id]
    );

    // 生成 Markdown
    let markdown = `# ${conversation.title}\n\n`;
    markdown += `创建时间: ${conversation.created_at}\n\n`;
    markdown += `---\n\n`;

    messages.forEach(msg => {
      const role = msg.role === 'user' ? '👤 用户' : '🤖 Claude';
      markdown += `## ${role}\n\n`;
      markdown += `${msg.content}\n\n`;
      markdown += `*${msg.created_at}*\n\n`;
      markdown += `---\n\n`;
    });

    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${conversation.title}.md"`);
    res.send(markdown);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 搜索对话
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;

    if (!q) {
      return res.status(400).json({ error: '搜索关键词不能为空' });
    }

    const results = await dbAll(
      `SELECT m.*, c.title as conversation_title
       FROM messages m
       JOIN conversations c ON m.conversation_id = c.id
       WHERE m.content LIKE ?
       ORDER BY m.created_at DESC
       LIMIT 50`,
      [`%${q}%`]
    );

    res.json({ results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
