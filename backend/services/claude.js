const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL,
  defaultHeaders: {
    'User-Agent': 'Claude-Code/1.0.18',
    'anthropic-beta': 'interleaved-thinking-2025-05-14',
  },
});

const MODEL_CANDIDATES = (() => {
  const candidatesEnv = process.env.ANTHROPIC_MODEL_CANDIDATES;
  if (candidatesEnv) {
    return candidatesEnv.split(',').map((m) => m.trim()).filter(Boolean);
  }
  return [process.env.ANTHROPIC_MODEL || 'claude-opus-4-6'];
})();

console.log('候选模型列表:', MODEL_CANDIDATES);

// --- Adaptive model ordering ---
const modelStats = new Map();
const BASE_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes
const MAX_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

const getStats = (model) => {
  if (!modelStats.has(model)) {
    modelStats.set(model, { lastSuccess: null, lastFailure: null, consecutiveFailures: 0 });
  }
  return modelStats.get(model);
};

const recordSuccess = (model) => {
  const stats = getStats(model);
  stats.lastSuccess = Date.now();
  stats.lastFailure = null;
  stats.consecutiveFailures = 0;
};

const recordFailure = (model) => {
  const stats = getStats(model);
  stats.lastFailure = Date.now();
  stats.consecutiveFailures += 1;
};

const getCooldownMs = (consecutiveFailures) => {
  return Math.min(BASE_COOLDOWN_MS * Math.pow(2, consecutiveFailures - 1), MAX_COOLDOWN_MS);
};

const getModelTier = (model) => {
  const stats = getStats(model);
  const now = Date.now();

  // Tier 1: recently succeeded, no failure after that success
  if (stats.lastSuccess && !stats.lastFailure) {
    return { tier: 1, sortKey: -stats.lastSuccess };
  }

  // Tier 3 or recovered: has recent failure
  if (stats.lastFailure && stats.consecutiveFailures > 0) {
    const cooldown = getCooldownMs(stats.consecutiveFailures);
    if (now - stats.lastFailure < cooldown) {
      // Still in cooldown → tier 3
      return { tier: 3, sortKey: stats.consecutiveFailures };
    }
    // Cooldown expired → back to tier 2
    return { tier: 2, sortKey: 0 };
  }

  // Tier 2: untested
  return { tier: 2, sortKey: 0 };
};

const getOrderedCandidates = () => {
  const withTier = MODEL_CANDIDATES.map((model, index) => ({
    model,
    originalIndex: index,
    ...getModelTier(model),
  }));

  withTier.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    if (a.tier === 2) return a.originalIndex - b.originalIndex; // preserve env var order for untested
    return a.sortKey - b.sortKey;
  });

  return withTier.map((item) => item.model);
};

const isRetryableError = (error) => {
  const status = error?.status;
  if (status === 503 || status === 429) return true;

  const message = getUpstreamErrorMessage(error).toLowerCase();
  return (
    message.includes('no available channel') ||
    message.includes('model_not_found') ||
    message.includes('model not found') ||
    message.includes('does not exist') ||
    message.includes('rate limit') ||
    message.includes('correct claude code client') ||
    message.includes('parameters in your request appear to be incorrect')
  );
};

const normalizeMessages = (messages = []) => {
  return messages
    .filter((item) => item?.role && item?.content)
    .map((item) => ({
      role: item.role,
      content: item.content,
    }));
};

const extractJsonFromErrorMessage = (message = '') => {
  const trimmed = String(message).trim();
  const jsonStart = trimmed.indexOf('{');

  if (jsonStart === -1) {
    return null;
  }

  try {
    return JSON.parse(trimmed.slice(jsonStart));
  } catch {
    return null;
  }
};

const getUpstreamErrorMessage = (error) => {
  const payload = extractJsonFromErrorMessage(error?.message);
  return payload?.error?.message || error?.error?.message || error?.message || '';
};

const normalizeUpstreamError = (error) => {
  const upstreamMessage = getUpstreamErrorMessage(error);
  const message = String(upstreamMessage || '').trim();

  if (!message) {
    const fallback = new Error('AI 服务暂时不可用，请稍后重试');
    fallback.status = 502;
    return fallback;
  }

  if (
    message.includes('Some parameters in your request appear to be incorrect') ||
    message.includes('上下文过长') ||
    message.includes('compact') ||
    message.includes('clear') ||
    message.includes('correct Claude Code client')
  ) {
    const friendly = new Error('当前对话过长或参数不兼容，请新建对话后重试。');
    friendly.status = 400;
    return friendly;
  }

  const fallback = new Error(message);
  fallback.status = error?.status || 502;
  return fallback;
};

async function createMessage(messages, maxTokens = 16000, model) {
  const thinkingBudget = Math.max(1024, maxTokens - 4000);
  return client.messages.create({
    model: model || MODEL_CANDIDATES[0],
    max_tokens: maxTokens,
    thinking: {
      type: 'enabled',
      budget_tokens: thinkingBudget,
    },
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

  if (contentTypes.includes('thinking') && !contentTypes.includes('text')) {
    return '上游响应只有 thinking，没有返回可展示的 text，通常是代理或模型兼容性问题';
  }

  if (contentTypes) {
    return `AI 返回了无法展示的内容：${contentTypes}`;
  }

  return 'AI 返回了空内容';
};

async function sendMessage(messages) {
  const ordered = getOrderedCandidates();
  console.log('候选模型顺序:', ordered);

  let lastError = null;

  for (let i = 0; i < ordered.length; i++) {
    const model = ordered[i];
    try {
      console.log(`尝试模型: ${model}`);
      const response = await createMessage(messages, 16000, model);
      console.log('Claude upstream response:', JSON.stringify({
        id: response?.id,
        type: response?.type,
        role: response?.role,
        model: response?.model,
        stop_reason: response?.stop_reason,
        stop_sequence: response?.stop_sequence,
        content: response?.content,
      }, null, 2));
      const text = getTextFromResponse(response);

      if (!text) {
        const emptyResponseError = new Error(buildEmptyResponseError(response));
        emptyResponseError.status = 502;
        throw emptyResponseError;
      }

      recordSuccess(model);
      return text;
    } catch (error) {
      lastError = error;
      console.error(`模型 ${model} 调用失败:`, error?.message || error);

      if (isRetryableError(error)) {
        recordFailure(model);
        if (i < ordered.length - 1) {
          console.log(`可重试错误，切换到下一个候选模型...`);
          continue;
        }
      }

      break;
    }
  }

  if (ordered.length > 1 && isRetryableError(lastError)) {
    const busyError = new Error('当前代理通道繁忙，所有候选模型均不可用，请稍后重试');
    busyError.status = 503;
    throw busyError;
  }

  throw normalizeUpstreamError(lastError);
}

async function generateSummary(messages) {
  try {
    const prompt = [
      {
        role: 'user',
        content: `请把下面对话整理成不超过 8 条的中文摘要，保留关键目标、已确认结论、待办和重要约束。不要使用标题，只输出摘要内容。\n\n${normalizeMessages(messages)
          .map((item) => `${item.role === 'user' ? '用户' : '助手'}: ${item.content}`)
          .join('\n\n')}`,
      },
    ];

    const response = await createMessage(prompt, 5000);
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
