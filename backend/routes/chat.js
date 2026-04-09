const express = require('express');
const router = express.Router();
const { dbRun, dbGet, dbAll } = require('../db/database');
const { sendMessage, generateSummary } = require('../services/claude');
const { searchHistory } = require('../services/search');

const RECENT_MESSAGE_LIMIT = 12;
const SUMMARY_TRIGGER_COUNT = 8;

const getConversationOrFail = async (id, res) => {
  const conversation = await dbGet(
    'SELECT * FROM conversations WHERE id = ?',
    [id]
  );

  if (!conversation) {
    res.fail(404, '对话不存在');
    return null;
  }

  return conversation;
};

const getRecentMessages = (messages) => {
  return messages.slice(-RECENT_MESSAGE_LIMIT).map(({ role, content }) => ({ role, content }));
};

const buildSearchPrompt = (results) => {
  if (!results.length) return null;

  return results
    .slice(0, 6)
    .map((item, index) => {
      return `相关历史 ${index + 1}｜对话：${item.conversation_title}\n角色：${item.role}\n内容：${item.content}`;
    })
    .join('\n\n');
};

const buildContextMessages = ({ recentMessages, summary, relatedHistory, currentContent }) => {
  const contextMessages = [];

  if (summary) {
    contextMessages.push({
      role: 'assistant',
      content: `当前对话摘要：\n${summary}`,
    });
  }

  if (relatedHistory) {
    contextMessages.push({
      role: 'assistant',
      content: `与当前问题相关的历史记录：\n${relatedHistory}`,
    });
  }

  contextMessages.push(...recentMessages);

  if (!recentMessages.length || recentMessages[recentMessages.length - 1]?.content !== currentContent) {
    contextMessages.push({ role: 'user', content: currentContent });
  }

  return contextMessages;
};

const updateConversationSummary = async (conversationId, model) => {
  const messages = await dbAll(
    'SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
    [conversationId]
  );

  if (messages.length < SUMMARY_TRIGGER_COUNT) {
    return null;
  }

  const summary = await generateSummary(messages, model);
  if (!summary) {
    return null;
  }

  await dbRun(
    `INSERT INTO conversation_summaries (conversation_id, summary, source_message_count, updated_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(conversation_id)
     DO UPDATE SET
       summary = excluded.summary,
       source_message_count = excluded.source_message_count,
       updated_at = CURRENT_TIMESTAMP`,
    [conversationId, summary, messages.length]
  );

  await dbRun(
    'UPDATE conversations SET last_summary = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [summary, conversationId]
  );

  return summary;
};

router.post('/conversations', async (req, res) => {
  try {
    const { project_id, title } = req.body;

    if (!title) {
      return res.fail(400, '对话标题不能为空');
    }

    const result = await dbRun(
      'INSERT INTO conversations (project_id, title) VALUES (?, ?)',
      [project_id || null, title]
    );

    const conversation = await dbGet(
      'SELECT * FROM conversations WHERE id = ?',
      [result.id]
    );

    res.success({ conversation });
  } catch (error) {
    res.fail(500, error.message);
  }
});

router.get('/conversations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const conversation = await getConversationOrFail(id, res);
    if (!conversation) return;

    const messages = await dbAll(
      'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
      [id]
    );

    const summary = await dbGet(
      'SELECT * FROM conversation_summaries WHERE conversation_id = ?',
      [id]
    );

    res.success({ conversation, messages, summary });
  } catch (error) {
    res.fail(500, error.message);
  }
});

router.post('/conversations/:id/messages', async (req, res) => {
  try {
    const { id } = req.params;
    const { content, model } = req.body;

    if (!content) {
      return res.fail(400, '消息内容不能为空');
    }

    const conversation = await getConversationOrFail(id, res);
    if (!conversation) return;

    const userResult = await dbRun(
      'INSERT INTO messages (conversation_id, role, content, model) VALUES (?, ?, ?, ?)',
      [id, 'user', content, model || null]
    );

    const userMessage = await dbGet(
      'SELECT * FROM messages WHERE id = ?',
      [userResult.id]
    );

    const allMessages = await dbAll(
      'SELECT id, role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
      [id]
    );

    const summaryRow = await dbGet(
      'SELECT summary FROM conversation_summaries WHERE conversation_id = ?',
      [id]
    );

    const relatedHistoryResults = await searchHistory({
      query: content,
      conversationId: id,
      limit: 6,
    });

    const relatedHistory = buildSearchPrompt(
      relatedHistoryResults.filter((item) => item.id !== userResult.id)
    );

    const promptMessages = buildContextMessages({
      recentMessages: getRecentMessages(allMessages),
      summary: summaryRow?.summary,
      relatedHistory,
      currentContent: content,
    });

    const assistantContent = await sendMessage(promptMessages, { model });

    if (!assistantContent) {
      throw new Error('AI 返回了空内容，未写入回复消息');
    }

    const assistantResult = await dbRun(
      'INSERT INTO messages (conversation_id, role, content, model) VALUES (?, ?, ?, ?)',
      [id, 'assistant', assistantContent, model || null]
    );

    const assistantMessage = await dbGet(
      'SELECT * FROM messages WHERE id = ?',
      [assistantResult.id]
    );

    await dbRun(
      'UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [id]
    );

    let summary = summaryRow;
    const nextMessageCount = allMessages.length + 1;
    if (nextMessageCount >= SUMMARY_TRIGGER_COUNT && nextMessageCount % 4 === 0) {
      const summaryText = await updateConversationSummary(id, model);
      if (summaryText) {
        summary = { summary: summaryText };
      }
    }

    res.success({ userMessage, assistantMessage, summary });
  } catch (error) {
    res.fail(500, error.message);
  }
});

router.get('/conversations/:id/export', async (req, res) => {
  try {
    const { id } = req.params;
    const conversation = await getConversationOrFail(id, res);
    if (!conversation) return;

    const messages = await dbAll(
      'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
      [id]
    );

    let markdown = `# ${conversation.title}\n\n`;
    markdown += `创建时间: ${conversation.created_at}\n\n`;
    markdown += `---\n\n`;

    messages.forEach((msg) => {
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
    res.fail(500, error.message);
  }
});

router.get('/search', async (req, res) => {
  try {
    const { q, project_id, conversation_id, role, from, to, limit } = req.query;

    if (!q) {
      return res.fail(400, '搜索关键词不能为空');
    }

    const results = await searchHistory({
      query: q,
      projectId: project_id,
      conversationId: conversation_id,
      role,
      from,
      to,
      limit,
    });

    res.success({ results });
  } catch (error) {
    res.fail(500, error.message);
  }
});

module.exports = router;
