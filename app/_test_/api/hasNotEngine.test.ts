import { NextRequest } from 'next/server';
import { POST } from '@/app/api/hasNotEngine/route';
import { verifyAuth } from '@/lib/auth';
import { checkAndUpdateUsage } from '@/lib/usage';
import OpenAI from 'openai';

// 导入模拟
jest.mock('@/lib/auth', () => require('../mocks/auth'));
jest.mock('@/lib/usage', () => require('../mocks/usage'));
jest.mock('openai', () => {
  const { mockOpenAI } = require('../mocks/openai');
  return jest.fn(() => mockOpenAI);
});

describe('hasNotEngine API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 测试成功请求
  test('应成功返回流式AI回复', async () => {
    const req = new NextRequest('http://localhost:3000/api/hasNotEngine', {
      method: 'POST',
      body: JSON.stringify({
        query: '你好，世界',
        model: 'gpt-4o-mini'
      })
    });

    const response = await POST(req);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    
    // 读取流数据
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let receivedData = '';

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        receivedData += decoder.decode(value);
      }
    }

    // 验证流式数据格式
    expect(receivedData).toContain('data:');
    expect(receivedData).toContain('[DONE]');
    expect(verifyAuth).toHaveBeenCalledTimes(1);
    expect(checkAndUpdateUsage).toHaveBeenCalledWith('test-user-id', 'fast');
  });

  // 测试无查询参数
  test('查询参数缺失时应返回400错误', async () => {
    const req = new NextRequest('http://localhost:3000/api/hasNotEngine', {
      method: 'POST',
      body: JSON.stringify({
        model: 'gpt-4o-mini'
      })
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('BAD_REQUEST');
  });

  // 测试认证失败
  test('认证失败时应返回401错误', async () => {
    (verifyAuth as jest.Mock).mockResolvedValueOnce({
      success: false
    });

    const req = new NextRequest('http://localhost:3000/api/hasNotEngine', {
      method: 'POST',
      body: JSON.stringify({
        query: '你好，世界'
      })
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  // 测试使用量限制
  test('使用量超限时应返回相应错误', async () => {
    (checkAndUpdateUsage as jest.Mock).mockRejectedValueOnce({
      name: 'UsageError',
      code: 'USAGE_LIMIT_EXCEEDED',
      message: '已达到使用限制',
      status: 403
    });

    const req = new NextRequest('http://localhost:3000/api/hasNotEngine', {
      method: 'POST',
      body: JSON.stringify({
        query: '你好，世界'
      })
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('USAGE_LIMIT_EXCEEDED');
  });
});