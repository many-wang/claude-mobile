# Claude 随身助手

一个轻量级的移动端 Claude 对话助手，支持项目管理、对话保存和 Markdown 导出。

## 功能特性

- 💬 与 Claude 实时对话
- 📁 按项目分类管理对话
- 💾 自动保存对话历史
- 📄 导出 Markdown 文档
- 🔍 搜索历史对话
- 📱 PWA 支持，可安装到手机主屏幕

## 技术栈

- **前端：** React + Vite + TailwindCSS
- **后端：** Node.js + Express
- **数据库：** SQLite
- **API：** Claude API (Anthropic)
- **部署：** Vercel

## 快速开始

### 后端

```bash
cd backend
npm install
cp .env.example .env
# 编辑 .env 填入你的 Claude API key
npm run dev
```

### 前端

```bash
cd frontend
npm install
npm run dev
```

访问 http://localhost:5173

## 项目结构

```
claude-mobile/
├── frontend/     # React 前端
├── backend/      # Express 后端
├── docs/         # 开发文档
└── README.md     # 本文件
```

## 开发文档

详细的开发文档请查看 [docs/开发文档.md](docs/开发文档.md)

## 部署

项目支持一键部署到 Vercel：

1. Fork 本项目
2. 在 Vercel 导入项目
3. 配置环境变量
4. 部署完成

## License

MIT

## 作者

开发于 2026-04-06
