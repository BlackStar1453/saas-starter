import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { checkAndUpdateUsage } from '@/lib/usage';
import { db } from '@/lib/db/drizzle';
import { getUserById } from '@/lib/db/queries';
import { sql } from 'drizzle-orm';

// CORS 设置
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Credentials': 'true',
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
    // 验证数据库连接
    try {
      await db.execute(sql`SELECT 1`);
    } catch (dbError) {
      console.error('数据库连接错误:', dbError);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'DATABASE_ERROR',
            message: '数据库连接失败，请稍后重试'
          }
        },
        { status: 500, headers: corsHeaders }
      );
    }

    // 验证请求体
    const body = await req.json();
    const { model, query} = body;

    // 验证认证信息
    const authResult = await verifyAuth(req);
    if (!authResult.success) {
      console.error('认证失败:', authResult.error);
      return NextResponse.json(
        { 
          success: false,
          error: {
            code: 'AUTH_ERROR',
            message: authResult.error
          }
        },
        { status: 401, headers: corsHeaders }
      );
    }

    // 验证用户是否存在
    const user = await getUserById(authResult.userId);
    if (!user) {
      console.error('用户不存在:', authResult.userId);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: '用户不存在或已被删除'
          }
        },
        { status: 404, headers: corsHeaders }
      );
    }

    if (!model || !query) {
      console.error('请求参数无效:', { model, query });
      return NextResponse.json(
        { 
          success: false,
          error: {
            code: 'BAD_REQUEST',
            message: '缺少必要的参数：model 和 query'
          }
        },
        { status: 400, headers: corsHeaders }
      );
    }

    // 检查并更新使用量
    try {
      if (model === 'premium') {
        await checkAndUpdateUsage(authResult.userId, 'premium');
      } else {
        await checkAndUpdateUsage(authResult.userId, 'fast');
      }
    } catch (usageError: any) {
      console.error('使用量检查错误:', usageError);
      
      if (usageError.name === 'UsageError') {
        return NextResponse.json(
          { 
            success: false,
            error: {
              code: usageError.code,
              message: usageError.message
            }
          },
          { status: usageError.status, headers: corsHeaders }
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'USAGE_CHECK_ERROR',
            message: '检查使用量时发生错误'
          }
        },
        { status: 500, headers: corsHeaders }
      );
    }

    // 返回成功响应
    return NextResponse.json(
      {
        success: true,
        canProceed: true
      },
      { headers: corsHeaders }
    );
    
  } catch (error: any) {
    // 详细记录错误信息
    console.error('hasEngine API 错误:', {
      error: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code
    });
    
    // 根据错误类型返回相应的错误信息
    if (error.name === 'JsonWebTokenError') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_TOKEN',
            message: 'Token无效或已过期'
          }
        },
        { status: 401, headers: corsHeaders }
      );
    }

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
          message: '服务器内部错误，请稍后重试'
        }
      },
      { status: 500, headers: corsHeaders }
    );
  }
}