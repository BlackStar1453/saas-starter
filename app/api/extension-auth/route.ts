import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { createHash } from 'crypto';

// 定义认证请求类型
interface PendingAuthRequest {
  extensionId: string;
  createdAt: Date;
  redirectURL?: string;
  authToken?: string;
  tokenHash?: string;
}

// 存储扩展的认证状态
export const pendingAuthRequests = new Map<string, PendingAuthRequest>();

// 清理过期的认证请求 - 延长到1小时
function cleanupOldRequests() {
  console.log("[API] 清理过期认证请求");
  const now = new Date();
  const expiredCount = Array.from(pendingAuthRequests.entries())
    .filter(([authState, data]) => {
      const isExpired = now.getTime() - data.createdAt.getTime() > 60 * 60 * 1000; // 1小时
      if (isExpired) {
        console.log(`[API] 删除过期认证请求: ${authState}`);
        pendingAuthRequests.delete(authState);
      }
      return isExpired;
    }).length;
  
  console.log(`[API] 清理了 ${expiredCount} 个过期请求，现有 ${pendingAuthRequests.size} 个活跃请求`);
}

// 定期清理，每10分钟执行一次
setInterval(cleanupOldRequests, 10 * 60 * 1000);

// 手动保存认证状态到日志
function logPendingRequests() {
  const requestCount = pendingAuthRequests.size;
  console.log(`[API] 当前有 ${requestCount} 个待处理的认证请求`);
  
  if (requestCount > 0) {
    console.log("[API] 认证请求详情:");
    pendingAuthRequests.forEach((data, state) => {
      console.log(`  - ${state}: ${JSON.stringify({
        extensionId: data.extensionId,
        createdAt: data.createdAt.toISOString(),
        redirectURL: data.redirectURL
      })}`);
    });
  }
}

// 每5分钟记录一次
setInterval(logPendingRequests, 5 * 60 * 1000);
// 立即执行一次记录
logPendingRequests();

// 处理扩展的认证请求
export async function POST(request: NextRequest) {
  try {
    console.log("[API] 收到扩展认证请求");
    
    const requestData = await request.json();
    const { extensionId, redirectURL, authToken } = requestData;
    
    console.log(`[API] 扩展ID: ${extensionId}, 重定向URL: ${redirectURL || 'none'}`);
    
    if (!extensionId) {
      console.error("[API] 缺少扩展ID参数");
      return new NextResponse(
        JSON.stringify({ error: "缺少扩展ID参数" }),
        { 
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
          }
        }
      );
    }

    const authState = nanoid();
    let tokenHash = undefined;
    
    if (authToken) {
      // 使用SHA-256对令牌进行哈希处理
      tokenHash = createHash('sha256').update(authToken).digest('hex');
    }
    
    pendingAuthRequests.set(authState, {
      extensionId,
      redirectURL,
      createdAt: new Date(),
      tokenHash
    });
    
    const authUrl = `/extension-auth?state=${authState}&redirect_uri=${encodeURIComponent(redirectURL || '')}`;
    
    return new NextResponse(
      JSON.stringify({
        success: true,
        authUrl,
        state: authState
      }),
      { 
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      }
    );
  } catch (error) {
    console.error("[API] 扩展认证请求错误:", error);
    return new NextResponse(
      JSON.stringify({ error: "服务器内部错误" }),
      { 
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      }
    );
  }
}

// 添加 OPTIONS 处理方法
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

// 检查认证状态
export async function GET(request: NextRequest) {
  try {
    console.log("[API] 收到认证状态检查请求");
    
    const authState = request.nextUrl.searchParams.get('state');
    const providedToken = request.nextUrl.searchParams.get('token');
    
    console.log(`[API] 检查状态: ${authState}`);
    
    if (!authState) {
      console.error("[API] 缺少state参数");
      return new NextResponse(
        JSON.stringify({ error: "缺少state参数", valid: false }),
        { 
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, max-age=0'
          }
        }
      );
    }
    
    const pendingRequest = pendingAuthRequests.get(authState);
    if (!pendingRequest) {
      console.error(`[API] 无效或过期的state: ${authState}`);
      return new NextResponse(
        JSON.stringify({ error: "无效或过期的state参数", valid: false }),
        { 
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, max-age=0'
          }
        }
      );
    }
    
    // 如果存在令牌哈希，验证提供的令牌
    if (pendingRequest.tokenHash && providedToken) {
      const providedTokenHash = createHash('sha256').update(providedToken).digest('hex');
      if (providedTokenHash !== pendingRequest.tokenHash) {
        console.error(`[API] 令牌验证失败`);
        return new NextResponse(
          JSON.stringify({ error: "认证令牌无效", valid: false }),
          { 
            status: 401,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-store, max-age=0'
            }
          }
        );
      }
    }
    
    console.log(`[API] 返回认证状态信息:`, {
      extensionId: pendingRequest.extensionId,
      redirectURL: pendingRequest.redirectURL,
      valid: true
    });
    
    return new NextResponse(
      JSON.stringify({
        success: true,
        extensionId: pendingRequest.extensionId,
        redirectURL: pendingRequest.redirectURL,
        valid: true
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, max-age=0',
        }
      }
    );
  } catch (error) {
    console.error("[API] 扩展认证状态检查错误:", error);
    return new NextResponse(
      JSON.stringify({ error: "服务器内部错误", valid: false }),
      { 
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, max-age=0'
        }
      }
    );
  }
} 