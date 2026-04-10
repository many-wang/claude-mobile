require('dotenv').config();

const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL,
});

const OUTPUT_PATH = path.join(__dirname, 'probe-results.json');
const DEFAULT_MODELS = [
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-opus-4-5-20251101',
  'claude-sonnet-4-5-20250929',
  'claude-opus-4-1-20250805',
  'claude-opus-4-20250514',
  'claude-sonnet-4-20250514',
  'claude-3-7-sonnet-20250219',
  'claude-3-5-sonnet-20241022',
  'claude-3-5-sonnet-20240620',
  'claude-haiku-4-5-20251001',
  'claude-3-5-haiku-20241022',
  'claude-3-opus-20240229',
  'claude-3-sonnet-20240229',
  'claude-3-haiku-20240307',
];

const getCandidates = () => {
  const env = process.env.ANTHROPIC_MODEL_CANDIDATES;
  if (env) {
    return env.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return DEFAULT_MODELS;
};

const extractJsonFromErrorMessage = (message = '') => {
  const trimmed = String(message).trim();
  const jsonStart = trimmed.indexOf('{');
  if (jsonStart === -1) return null;
  try {
    return JSON.parse(trimmed.slice(jsonStart));
  } catch {
    return null;
  }
};

const getErrorMessage = (error) => {
  const payload = extractJsonFromErrorMessage(error?.message);
  return payload?.error?.message || error?.error?.message || error?.message || '';
};

const getContentTypes = (response) => {
  if (!Array.isArray(response?.content)) return [];
  return response.content.map((block) => block?.type).filter(Boolean);
};

const getText = (response) => {
  if (!Array.isArray(response?.content)) return '';
  return response.content
    .filter((block) => block?.type === 'text' && block.text)
    .map((block) => block.text)
    .join('\n')
    .trim();
};

const classifyResult = ({ response, error }) => {
  if (response) {
    const contentTypes = getContentTypes(response);
    const text = getText(response);

    if (text) {
      return {
        status: 'ok-text',
        contentTypes,
        text,
      };
    }

    if (contentTypes.includes('thinking') && !contentTypes.includes('text')) {
      return {
        status: 'thinking-only',
        contentTypes,
        text: '',
      };
    }

    return {
      status: 'non-text-response',
      contentTypes,
      text: '',
    };
  }

  const status = error?.status || null;
  const message = getErrorMessage(error);
  const lower = String(message).toLowerCase();

  if (lower.includes('no available channel') || lower.includes('model_not_found') || lower.includes('model not found')) {
    return { status: 'unavailable', errorMessage: message, httpStatus: status };
  }

  if (lower.includes('correct claude code client') || lower.includes('parameters in your request appear to be incorrect')) {
    return { status: 'rejected', errorMessage: message, httpStatus: status };
  }

  return { status: 'error', errorMessage: message, httpStatus: status };
};

async function probeModel(model) {
  const startedAt = new Date().toISOString();
  console.log(`\n=== 探测模型: ${model} ===`);

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 64,
      messages: [
        {
          role: 'user',
          content: 'Reply with exactly: OK',
        },
      ],
    });

    const result = classifyResult({ response });
    const record = {
      model,
      testedAt: startedAt,
      finishedAt: new Date().toISOString(),
      stopReason: response?.stop_reason || null,
      anthropicModel: response?.model || model,
      ...result,
    };

    console.log(JSON.stringify(record, null, 2));
    return record;
  } catch (error) {
    const result = classifyResult({ error });
    const record = {
      model,
      testedAt: startedAt,
      finishedAt: new Date().toISOString(),
      ...result,
    };

    console.log(JSON.stringify(record, null, 2));
    return record;
  }
}

async function main() {
  const models = getCandidates();
  console.log('开始探测模型，总数:', models.length);
  console.log('模型列表:', models);

  const results = [];
  for (const model of models) {
    const record = await probeModel(model);
    results.push(record);
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2), 'utf8');

  const grouped = results.reduce((acc, item) => {
    acc[item.status] = acc[item.status] || [];
    acc[item.status].push(item.model);
    return acc;
  }, {});

  console.log('\n=== 汇总 ===');
  console.log(JSON.stringify(grouped, null, 2));
  console.log(`\n结果已写入: ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error('探测脚本执行失败:', error);
  process.exit(1);
});
