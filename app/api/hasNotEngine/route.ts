import { NextRequest, NextResponse } from 'next/server';
import { fastVerifyAuth } from '@/lib/auth';
import { checkAndUpdateUsage } from '@/lib/usage';
import { detectRegionByNetwork } from '@/lib/networkDetector';
import OpenAI from 'openai';
import { models } from '../models/route';
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
  const startTime = Date.now(); // 开始计时
  try {


    
     // 使用更快的令牌验证方法
    const authResult = await fastVerifyAuth(req);
    
    if (!authResult.success) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      );
    }  

    // 验证请求体
    const body = await req.json();
    const { model, messages, query } = body;

      // 创建一个 TransformStream 用于流式传输
      const encoder = new TextEncoder();
      const responseStream = new TransformStream();
      const writer = responseStream.writable.getWriter();
  
      // 开始流式响应
      const response = new NextResponse(responseStream.readable, {
        headers: corsHeaders,
      });

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

    // 准备消息数组
    const apiMessages = messages || [
      {
        role: "user",
        content: query
      }
    ];

    // 获取模型信息
    const modelInfo = models.find(m => m.name === model) || { name: 'gpt-4o-mini', id: 'gpt-4o-mini', modelType: 'fast' };
    console.log(`[API] 使用模型: ${modelInfo.name}, 类型: ${modelInfo.modelType}`);

    const openAICompletionTime = Date.now() - startTime;
    console.log(`[API] OpenAI API首次响应耗时: ${openAICompletionTime}ms`);

    // 使用网络检测来判断用户区域
    const userRegion = await detectRegionByNetwork();
    console.log(`[API] 用户区域检测结果: ${userRegion}`);
    const userType = "Premium"; // 根据您的验证逻辑判断
    const modelType = modelInfo.modelType;


    const client = new OpenAI({
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: process.env.OPENROUTER_API_KEY,
      });
    
    const completion = await client.chat.completions.create({
      model: model || "gpt-4o-mini",
      messages: apiMessages,
      stream: true,
    });
  
    // 处理流式响应
     (async () => {
      try {
        for await (const chunk of completion) {
          // 检查chunk是否为有效的对象
          if (chunk && typeof chunk === 'object') {
            await writer.write(
              encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)
            );
          } else if (typeof chunk === 'string') {
            // 处理可能的字符串响应
            // 如果包含"OPENROUTER PROCESSING"则跳过
            console.log('跳过处理前缀:', chunk);
            
          }
        }
        // 结束流
        await writer.write(encoder.encode('data: [DONE]\n\n'));
        await writer.close();
      } catch (error) {
        console.error('流处理错误:', error);
        await writer.abort(error);
      }
    })(); 

    // 检查并更新使用量
    await checkAndUpdateUsage(authResult.userId, modelInfo.modelType as 'premium' | 'fast');   
    const checkAndUpdateUsageTime = Date.now() - startTime;
    console.log(`[API] 检查并更新使用量耗时: ${checkAndUpdateUsageTime}ms, 模型类型: ${modelInfo.modelType}`);

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
  } finally {
    // 记录总处理时间
    const totalTime = Date.now() - startTime;
    console.log(`[API] hasNotEngine 总处理时间: ${totalTime}ms`);
  }
} 