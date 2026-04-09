const express = require('express');
const router = express.Router();
const { dbRun, dbGet, dbAll } = require('../db/database');

// 获取所有项目
router.get('/', async (req, res) => {
  try {
    const projects = await dbAll(
      'SELECT * FROM projects ORDER BY updated_at DESC'
    );
    res.success({ projects });
  } catch (error) {
    res.fail(500, error.message);
  }
});

// 创建新项目
router.post('/', async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.fail(400, '项目名称不能为空');
    }

    const result = await dbRun(
      'INSERT INTO projects (name, description) VALUES (?, ?)',
      [name, description || '']
    );

    const project = await dbGet(
      'SELECT * FROM projects WHERE id = ?',
      [result.id]
    );

    res.success({ project });
  } catch (error) {
    res.fail(500, error.message);
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

    res.success({ conversations });
  } catch (error) {
    res.fail(500, error.message);
  }
});

// 删除项目
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await dbRun('DELETE FROM projects WHERE id = ?', [id]);
    res.success();
  } catch (error) {
    res.fail(500, error.message);
  }
});

module.exports = router;
