import { NextRequest } from 'next/server';
import { db } from './db/drizzle';
import { users } from './db/schema';
import { eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import redis from './redis';

const JWT_SECRET = process.env.AUTH_SECRET || 'your-secret-key';
// 缓存过期时间（秒）
const CACHE_TTL = 3600; // 1小时

// 短令牌过期时间（秒）
const ACCESS_TOKEN_TTL = 15 * 60; // 15分钟

interface SuccessAuthResult {
  success: true;
  userId: number;
  role: string;
  plan: string;
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
      role: user.role,
      plan: user.planName || 'free'
    };
  } catch (error) {
    console.error('Auth verification error:', error);
    return { 
      success: false, 
      error: 'Invalid token' 
    };
  }
}

/**
 * 针对高频API端点的轻量级快速验证方法
 * 使用Redis缓存减少数据库查询，提高响应速度
 */
export async function quickVerifyAuth(req: NextRequest): Promise<AuthResult> {
  try {
    // 从请求头获取token
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return { success: false, error: '未提供令牌' };
    }
    
    const token = authHeader.split(' ')[1];
    if (!token) {
      return { success: false, error: '令牌格式错误' };
    }

    // 验证token
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number };
    const userId = decoded.userId;
    
    // 从缓存获取用户信息
    const cacheKey = `user:auth:${userId}`;
    let userData = await redis.get(cacheKey);
    
    // 缓存未命中，查询数据库
    if (!userData) {
      const user = await db
        .select({
          id: users.id,
          role: users.role,
          planName: users.planName,
          deletedAt: users.deletedAt
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
        .then(rows => rows[0]);
      
      if (!user) {
        return { success: false, error: '用户未找到' };
      }
      
      if (user.deletedAt) {
        return { success: false, error: '用户账号已删除' };
      }
      
      // 只缓存必要的信息
      userData = {
        id: user.id,
        role: user.role,
        planName: user.planName || 'free'
      };
      
      // 设置缓存
      await redis.set(cacheKey, userData, { ex: CACHE_TTL });
    }
    
    const typedUserData = userData as { id: number; role: string; planName: string };
    
    return {
      success: true,
      userId: typedUserData.id,
      role: typedUserData.role,
      plan: typedUserData.planName
    };
  } catch (error) {
    console.error('快速验证错误:', error);
    return { success: false, error: '无效令牌' };
  }
}

// 手动使缓存失效的方法（用户信息更新时调用）
export async function invalidateUserAuthCache(userId: number): Promise<void> {
  const cacheKey = `user:auth:${userId}`;
  await redis.del(cacheKey);
}

// 简化的快速验证方法 - 通过签名验证而非完整解码
export async function fastVerifyAuth(req: NextRequest): Promise<AuthResult> {
  try {
    // 从请求头获取token
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return { success: false, error: '未提供令牌' };
    }
    
    const token = authHeader.split(' ')[1];
    if (!token) {
      return { success: false, error: '令牌格式错误' };
    }

    // 1. 首先检查Redis缓存中的有效令牌
    const tokenKey = `token:valid:${token}`;
    const cachedToken = await redis.get(tokenKey);
    
    if (cachedToken) {
      // 令牌在缓存中有效，直接返回用户信息
      const userData = cachedToken as { 
        userId: number; 
        role: string; 
        plan: string;
      };
      
      return {
        success: true,
        userId: userData.userId,
        role: userData.role,
        plan: userData.plan
      };
    }
    
    // 2. 未命中缓存，需验证令牌
    try {
      // 使用非阻塞方式验证JWT
      const decoded = jwt.verify(token, JWT_SECRET, {
        algorithms: ['HS256'], // 明确指定算法提高效率
        complete: false // 不返回完整的解码对象，只返回有效载荷
      }) as { userId: number };
      
      const userId = decoded.userId;
      
      // 从用户缓存获取信息
      const userKey = `user:auth:${userId}`;
      let userData = await redis.get(userKey);
      
      if (!userData) {
        // 缓存未命中，查询数据库（只查询必要字段）
        const user = await db
          .select({
            id: users.id,
            role: users.role,
            planName: users.planName,
            deletedAt: users.deletedAt
          })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1)
          .then(rows => rows[0]);
        
        if (!user) {
          return { success: false, error: '用户未找到' };
        }
        
        if (user.deletedAt) {
          return { success: false, error: '用户账号已删除' };
        }
        
        userData = {
          id: user.id,
          role: user.role,
          planName: user.planName || 'free'
        };
        
        // 设置用户信息缓存
        await redis.set(userKey, userData, { ex: CACHE_TTL });
      }
      
      const typedUserData = userData as { id: number; role: string; planName: string };
      
      // 缓存有效令牌 - 设置较短的过期时间
      const tokenData = {
        userId: typedUserData.id,
        role: typedUserData.role,
        plan: typedUserData.planName
      };
      
      await redis.set(tokenKey, tokenData, { ex: ACCESS_TOKEN_TTL });
      
      return {
        success: true,
        userId: typedUserData.id,
        role: typedUserData.role,
        plan: typedUserData.planName
      };
    } catch (jwtError) {
      return { success: false, error: '无效令牌' };
    }
  } catch (error) {
    console.error('快速验证错误:', error);
    return { success: false, error: '验证过程错误' };
  }
}

// 吊销令牌方法
export async function revokeToken(token: string): Promise<void> {
  if (!token) return;
  
  // 尝试获取令牌的用户ID
  try {
    const decoded = jwt.decode(token) as { userId: number } | null;
    if (decoded?.userId) {
      // 删除用户缓存
      const userKey = `user:auth:${decoded.userId}`;
      await redis.del(userKey);
    }
  } catch (e) {
    console.error('解析令牌失败:', e);
  }
  
  // 删除令牌缓存
  const tokenKey = `token:valid:${token}`;
  await redis.del(tokenKey);
} 