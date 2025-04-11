import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/db/queries";
import { cookies } from "next/headers";
import { sign } from "jsonwebtoken";

const JWT_SECRET = process.env.AUTH_SECRET || 'default_secret_change_this';

// 扩展认证回调处理
export async function POST(request: NextRequest) {
  try {
    const { state } = await request.json();
    
    if (!state) {
      return NextResponse.json(
        { error: "Missing state parameter" },
        { status: 400 }
      );
    }
    
    // 验证用户是否已登录
    const user = await getUser();
    if (!user) {
      return NextResponse.json(
        { error: "User not authenticated" },
        { status: 401 }
      );
    }
    
    // 创建扩展专用的JWT令牌
    const token = sign(
      { 
        userId: user.id,
        email: user.email,
        name: user.name || '',
        role: user.role,
        // 不包含敏感信息如密码哈希
      },
      JWT_SECRET,
      { expiresIn: '720h' }
    );
    
    // 返回用户数据和令牌
    return NextResponse.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        premiumRequestsUsed: user.premiumRequestsUsed,
        premiumRequestsLimit: user.premiumRequestsLimit,
        fastRequestsUsed: user.fastRequestsUsed,
        fastRequestsLimit: user.fastRequestsLimit
      }
    });
  } catch (error) {
    console.error("Extension auth callback error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 