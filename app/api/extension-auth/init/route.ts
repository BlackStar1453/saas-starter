import { NextRequest, NextResponse } from "next/server";

// 从主文件导入共享的状态存储
// 假设主extension-auth/route.ts文件中定义了这个Map
import { pendingAuthRequests } from "../route";

// 调试查看当前存储的所有认证请求
function logAllAuthRequests() {
  console.log("[API] 当前所有认证请求:");
  pendingAuthRequests.forEach((value, key) => {
    console.log(`  - ${key}: ${JSON.stringify(value)}`);
  });
}

// 获取认证状态信息
export async function GET(request: NextRequest) {
  try {
    console.log("[API/init] 获取认证状态 - 开始处理");
    console.log("[API/init] 完整URL:", request.url);
    
    // 打印所有请求头
    const headers = Object.fromEntries(request.headers.entries());
    console.log("[API/init] 请求头:", headers);
    
    const authState = request.nextUrl.searchParams.get('state');
    
    console.log(`[API/init] 查询参数 state=${authState}`);
    
    if (!authState) {
      console.error("[API/init] 缺少state参数");
      return NextResponse.json(
        { error: "缺少state参数", valid: false },
        { 
          status: 400,
          headers: { 'Cache-Control': 'no-store, max-age=0' }
        }
      );
    }
    
    console.log(`[API/init] 查询state: ${authState}`);
    
    // 打印所有认证请求以进行调试
    logAllAuthRequests();
    
    const pendingRequest = pendingAuthRequests.get(authState);
    if (!pendingRequest) {
      console.error(`[API/init] 无效或过期的state: ${authState}, 当前Map中有 ${pendingAuthRequests.size} 个认证请求`);
      return NextResponse.json(
        { error: "无效或过期的state参数", state: authState, valid: false },
        { 
          status: 404,
          headers: { 'Cache-Control': 'no-store, max-age=0' }
        }
      );
    }
    
    console.log(`[API/init] 查询成功:`, pendingRequest);
    
    // 认证成功后，保留状态信息至少5分钟，以防用户刷新页面
    pendingRequest.createdAt = new Date(); // 刷新创建时间
    
    return NextResponse.json({
      success: true,
      extensionId: pendingRequest.extensionId,
      redirectURL: pendingRequest.redirectURL,
      valid: true
    }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      }
    });
  } catch (error) {
    console.error("[API/init] 扩展认证状态检查错误:", error);
    // 记录详细的错误堆栈
    if (error instanceof Error) {
      console.error('[API/init] 错误堆栈:', error.stack);
    }
    return NextResponse.json(
      { error: "服务器内部错误", valid: false },
      { 
        status: 500,
        headers: { 'Cache-Control': 'no-store, max-age=0' }
      }
    );
  }
} 