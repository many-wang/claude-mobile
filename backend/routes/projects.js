const express = require('express');
const router = express.Router();
const { dbRun, dbGet, dbAll } = require('../db/database');

// 获取所有项目
router.get('/', async (req, res) => {
  try {
    const projects = await dbAll(
      'SELECT * FROM projects ORDER BY updated_at DESC'
    );
    res.json({ projects });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 创建新项目
router.post('/', async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ error: '项目名称不能为空' });
    }

    const result = await dbRun(
      'INSERT INTO projects (name, description) VALUES (?, ?)',
      [name, description || '']
    );

    const project = await dbGet(
      'SELECT * FROM projects WHERE id = ?',
      [result.id]
    );

    res.json({ project });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取项目下的所有对话
router.get('/:id/conversations', async (req, res) => {
  try {
    const { id } = req.params;

    const conversations = await dbAll(
      'SELECT * FROM conversations WHERE project_id = ? ORDER BY updated_at DESC',
      [id]
    );

    res.json({ conversations });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 删除项目
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await dbRun('DELETE FROM projects WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
