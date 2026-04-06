const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * 发送消息给 Claude 并获取回复
 * @param {Array} messages - 消息历史 [{ role: 'user', content: '...' }]
 * @returns {Promise<string>} Claude 的回复内容
 */
async function sendMessage(messages) {
  try {
    const response = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4096,
      messages: messages,
    });

    return response.content[0].text;
  } catch (error) {
    console.error('Claude API 调用失败:', error);
    throw new Error('AI 服务暂时不可用，请稍后重试');
  }
}

module.exports = {
  sendMessage
};
