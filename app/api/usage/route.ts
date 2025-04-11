import { NextRequest, NextResponse } from "next/server";
import { getUserUsage } from '@/lib/usage';
import { verifyAuth } from '@/lib/auth';
import { db } from "@/lib/db/drizzle";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// 设置允许cors
export const cors = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}

export async function POST(req: NextRequest) {
  try {
    // 验证认证信息
    const authResult = await verifyAuth(req);
    if (!authResult.success) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 验证管理员权限
    if (authResult.role !== 'admin') {
      return NextResponse.json(
        { 
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Admin access required'
          }
        },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json(
        { 
          success: false,
          error: {
            code: 'BAD_REQUEST',
            message: 'User ID is required'
          }
        },
        { status: 400 }
      );
    }

    // 重置用户使用量
    await db
      .update(users)
      .set({
        premiumRequestsUsed: 0,
        fastRequestsUsed: 0,
        usageLastResetAt: new Date(),
      })
      .where(eq(users.id, userId));

    return NextResponse.json({
      success: true,
      message: 'Usage reset successfully'
    });
  } catch (error: any) {
    console.error('Error in usage reset API:', error);
    
    return NextResponse.json(
      { 
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error'
        }
      },
      { status: 500 }
    );
  }
}

// 获取当前用量
export async function GET(req: NextRequest) {
  try {
    // 验证认证信息
    const authResult = await verifyAuth(req);
    if (!authResult.success) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 获取使用量信息
    const usage = await getUserUsage(authResult.userId);

    return NextResponse.json({
      success: true,
      data: usage
    });
  } catch (error: any) {
    console.error('Error in usage API:', error);
    
    if (error.name === 'UsageError') {
      return NextResponse.json(
        { 
          success: false,
          error: {
            code: error.code,
            message: error.message
          }
        },
        { status: error.status }
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
      { status: 500 }
    );
  }
} 