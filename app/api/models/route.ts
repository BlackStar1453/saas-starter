import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';

// CORS 设置
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Credentials': 'true',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-cache'
};

// 处理 OPTIONS 请求（预检请求）
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

// 定义模型列表
const models = [
  // OpenAI 模型
  'GPT-4:gpt-4',
  'GPT-4o:gpt-4o',
  'GPT-4o-mini:gpt-4o-mini',
  'GPT-3.5 Turbo:gpt-3.5-turbo',
  // Deepseek 模型
  'Deepseek Chat:deepseek-chat',
  'Deepseek Coder:deepseek-coder'
];

export async function GET(req: NextRequest) {
  try {
    // 验证认证信息
    const authResult = await verifyAuth(req);
    if (!authResult.success) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      );
    }

    // 返回模型列表
    return NextResponse.json(
      {
        success: true,
        message: models
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (error: any) {
    console.error('Error in models API:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '内部服务器错误'
        }
      },
      { status: 500, headers: corsHeaders }
    );
  }
} 