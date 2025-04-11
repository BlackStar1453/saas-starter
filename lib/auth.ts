import { NextRequest } from 'next/server';
import { db } from './db/drizzle';
import { users } from './db/schema';
import { eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { log } from 'node:console';

const JWT_SECRET = process.env.AUTH_SECRET || 'your-secret-key';

interface SuccessAuthResult {
  success: true;
  userId: number;
  role: string;
}

interface FailureAuthResult {
  success: false;
  error: string;
}

type AuthResult = SuccessAuthResult | FailureAuthResult;

export async function verifyAuth(req: NextRequest): Promise<AuthResult> {
  try {
    // 从请求头获取 token
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return { 
        success: false, 
        error: 'No token provided' 
      };
    }
    const token = authHeader.split(' ')[1];
    if (!token) {
      return { 
        success: false, 
        error: 'No token provided' 
      };
    }
log('JWT_SECRET', JWT_SECRET);
    log('token', token);
    // 验证 token
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number };
    
    // 获取用户信息
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, decoded.userId))
      .limit(1)
      .then(rows => rows[0]);

    if (!user) {
      return { 
        success: false, 
        error: 'User not found' 
      };
    }

    // 检查用户状态
    if (user.deletedAt) {
      return { 
        success: false, 
        error: 'User account is deleted' 
      };
    }

    return {
      success: true,
      userId: user.id,
      role: user.role
    };
  } catch (error) {
    console.error('Auth verification error:', error);
    return { 
      success: false, 
      error: 'Invalid token' 
    };
  }
} 