const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL,
});

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-6';

const normalizeMessages = (messages = []) => {
  return messages
    .filter((item) => item?.role && item?.content)
    .map((item) => ({
      role: item.role,
      content: item.content,
    }));
};

async function createMessage(messages, model, maxTokens = 4096) {
  return client.messages.create({
    model: model || MODEL,
    max_tokens: maxTokens,
    messages: normalizeMessages(messages),
  });
}

const getTextFromResponse = (response) => {
  if (!Array.isArray(response?.content)) {
    return '';
  }

  return response.content
    .filter((block) => block?.type === 'text' && block.text)
    .map((block) => block.text)
    .join('\n')
    .trim();
};

const buildEmptyResponseError = (response) => {
  if (!response) {
    return 'AI 服务返回了空响应';
  }

  if (!Array.isArray(response.content)) {
    return 'AI 服务返回了异常响应格式';
  }

  const contentTypes = response.content
    .map((block) => block?.type)
    .filter(Boolean)
    .join(', ');

  if (contentTypes) {
    return `AI 返回了非文本内容：${contentTypes}`;
  }

  return 'AI 返回了空内容';
};

async function sendMessage(messages, options = {}) {
  try {
    const response = await createMessage(messages, options.model, 4096);
    const text = getTextFromResponse(response);

    if (!text) {
      throw new Error(buildEmptyResponseError(response));
    }

    return text;
  } catch (error) {
    console.error('Claude API 调用失败:', error);
    throw new Error(error?.message || 'AI 服务暂时不可用，请稍后重试');
  }
}

async function generateSummary(messages, model) {
  try {
    const prompt = [
      {
        role: 'user',
        content: `请把下面对话整理成不超过 8 条的中文摘要，保留关键目标、已确认结论、待办和重要约束。不要使用标题，只输出摘要内容。\n\n${normalizeMessages(messages)
          .map((item) => `${item.role === 'user' ? '用户' : '助手'}: ${item.content}`)
          .join('\n\n')}`,
      },
    ];

    const response = await createMessage(prompt, model, 800);
    return getTextFromResponse(response) || null;
  } catch (error) {
    console.error('摘要生成失败:', error);
    return null;
  }
}

module.exports = {
  sendMessage,
  generateSummary,
};
