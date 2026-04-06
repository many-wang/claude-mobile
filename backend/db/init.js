require('dotenv').config();
const { initDatabase } = require('./database');

console.log('开始初始化数据库...');
initDatabase();

setTimeout(() => {
  console.log('数据库初始化完成');
  process.exit(0);
}, 1000);
