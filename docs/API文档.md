# API 接口文档

## 基础信息

**Base URL:** `http://localhost:3000/api`

**认证方式:** 暂无（单用户版本）

**响应格式:** JSON

---

## 1. 项目管理

### 1.1 获取所有项目

**GET** `/projects`

**响应示例:**
```json
{
  "success": true,
  "projects": [
    {
      "id": 1,
      "name": "作业检查 App",
      "description": "讨论作业检查应用的开发",
      "created_at": "2026-04-06T10:00:00Z",
      "updated_at": "2026-04-06T10:00:00Z",
      "conversation_count": 3
    }
  ]
}
```

### 1.2 创建项目

**POST** `/projects`

**请求体:**
```json
{
  "name": "项目名称",
  "description": "项目描述（可选）"
}
```

**响应示例:**
```json
{
  "success": true,
  "project": {
    "id": 1,
    "name": "项目名称",
    "description": "项目描述",
    "created_at": "2026-04-06T10:00:00Z"
  }
}
```

### 1.3 获取项目的对话列表

**GET** `/projects/:id/conversations`

**响应示例:**
```json
{
  "success": true,
  "conversations": [
    {
      "id": 1,
      "project_id": 1,
      "title": "初步讨论",
      "message_count": 10,
      "created_at": "2026-04-06T10:00:00Z",
      "updated_at": "2026-04-06T11:00:00Z"
    }
  ]
}
```

---

## 2. 对话管理

### 2.1 创建对话

**POST** `/conversations`

**请求体:**
```json
{
  "project_id": 1,
  "title": "对话标题"
}
```

**响应示例:**
```json
{
  "success": true,
  "conversation": {
    "id": 1,
    "project_id": 1,
    "title": "对话标题",
    "created_at": "2026-04-06T10:00:00Z"
  }
}
```

### 2.2 获取对话详情

**GET** `/conversations/:id`

**响应示例:**
```json
{
  "success": true,
  "conversation": {
    "id": 1,
    "project_id": 1,
    "title": "对话标题",
    "created_at": "2026-04-06T10:00:00Z"
  },
  "messages": [
    {
      "id": 1,
      "role": "user",
      "content": "你好",
      "created_at": "2026-04-06T10:00:00Z"
    },
    {
      "id": 2,
      "role": "assistant",
      "content": "你好！有什么我可以帮助你的吗？",
      "created_at": "2026-04-06T10:00:05Z"
    }
  ]
}
```

### 2.3 发送消息

**POST** `/conversations/:id/messages`

**请求体:**
```json
{
  "content": "用户消息内容"
}
```

**响应示例:**
```json
{
  "success": true,
  "userMessage": {
    "id": 1,
    "role": "user",
    "content": "用户消息内容",
    "created_at": "2026-04-06T10:00:00Z"
  },
  "assistantMessage": {
    "id": 2,
    "role": "assistant",
    "content": "Claude 的回复内容",
    "created_at": "2026-04-06T10:00:05Z"
  }
}
```

### 2.4 导出对话

**GET** `/conversations/:id/export`

**响应:** Markdown 格式文本

**示例:**
```markdown
# 对话标题

**创建时间:** 2026-04-06 10:00:00

---

## 用户
你好

## Claude
你好！有什么我可以帮助你的吗？

---
```

---

## 3. 搜索

### 3.1 搜索对话

**GET** `/search?q=关键词`

**响应示例:**
```json
{
  "success": true,
  "results": [
    {
      "conversation_id": 1,
      "conversation_title": "对话标题",
      "message_id": 5,
      "role": "assistant",
      "content": "包含关键词的消息内容...",
      "created_at": "2026-04-06T10:00:00Z"
    }
  ]
}
```

---

## 错误响应

所有接口在出错时返回统一格式：

```json
{
  "success": false,
  "error": "错误信息"
}
```

**常见错误码:**
- 400: 请求参数错误
- 404: 资源不存在
- 500: 服务器内部错误
