import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { checkAndUpdateUsage } from '@/lib/usage';
import {Portkey} from 'portkey-ai';
// CORS 设置
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Credentials': 'true',
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive'
};

// 处理 OPTIONS 请求（预检请求）
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function POST(req: NextRequest) {
  try {
    // 验证认证信息
     const authResult = await verifyAuth(req);
    if (!authResult.success) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      );
    } 

    // 验证请求体
    const body = await req.json();
    const { model, messages,  query } = body;

    // 支持两种格式：标准OpenAI格式和简化格式
    if (!messages && !query) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'BAD_REQUEST',
            message: 'Either messages or query is required'
          }
        },
        { status: 400, headers: corsHeaders }
      );
    }

     // 检查并更新使用量
    await checkAndUpdateUsage(authResult.userId, 'fast'); 

    // 创建一个 TransformStream 用于流式传输
    const encoder = new TextEncoder();
    const responseStream = new TransformStream();
    const writer = responseStream.writable.getWriter();

    // 开始流式响应
    const response = new NextResponse(responseStream.readable, {
      headers: corsHeaders,
    });

    // 准备消息数组
    const apiMessages = messages || [
      {
        role: "user",
        content: query
      }
    ];




// Construct a client with a virtual key


const userRegion = "CN"; // 可以通过IP库或请求头判断
const userType = authResult.plan; // 根据您的验证逻辑判断
const modelType = "advanced";

console.log(model, apiMessages, userRegion, userType, modelType);

const portkey = new Portkey({
  apiKey: "D1KhOKliis1+7mQYTlao3xPfnkbf",
  config: "pc-elick-dba06f",
})


const completion = await  portkey.chat.completions.create(
  {
    messages: apiMessages,
    model: model || 'gpt-4o-mini',
    stream: true
  },
  {
    metadata: {
      region: userRegion,
      userType: userType
    },
  },
);

    // 处理流式响应
    (async () => {
      try {
        for await (const chunk of completion) {
          // 直接转发完整的OpenAI响应
          await writer.write(
            encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)
          );
        }
        // 结束流
        await writer.write(encoder.encode('data: [DONE]\n\n'));
        await writer.close();
      } catch (error) {
        console.error('Streaming error:', error);
        await writer.abort(error);
      }
    })();

    return response;
  } catch (error: any) {
    console.error('Error in hasNotEngine API:', error);

    if (error.name === 'UsageError') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message
          }
        },
        { status: error.status, headers: corsHeaders }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error'
        }
      },
      { status: 500, headers: corsHeaders }
    );
  }
} 