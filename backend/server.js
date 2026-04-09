require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDatabase } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*'
}));
app.use(express.json());

app.use((req, res, next) => {
  res.success = (data = {}) => res.json({ success: true, ...data });
  res.fail = (status, error) => res.status(status).json({ success: false, error });
  next();
});

app.use('/api/projects', require('./routes/projects'));
app.use('/api', require('./routes/chat'));

app.get('/health', (req, res) => {
  res.success({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((req, res) => {
  res.fail(404, '接口不存在');
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.fail(500, err.message || '服务器内部错误');
});

const start = async () => {
  try {
    await initDatabase();
    app.listen(PORT, () => {
      console.log(`服务器运行在 http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('服务启动失败:', error);
    process.exit(1);
  }
};

start();
