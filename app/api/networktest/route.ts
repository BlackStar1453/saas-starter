import { NextRequest, NextResponse } from 'next/server';
import { 
  checkNetworkAccess, 
  checkNetworkWithCache, 
  canAccessInternationalServices,
  detectRegionByNetwork,
  clearNetworkCache
} from '@/lib/networkDetector';
import { Redis } from '@upstash/redis';

// 初始化Redis客户端
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

// CORS 设置
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Credentials': 'true'
};

// 处理 OPTIONS 请求（预检请求）
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

// 网络检测缓存键
const NETWORK_CACHE_KEY = 'network:access:check';

/**
 * 获取Redis缓存信息
 */
async function getRedisCacheInfo() {
  try {
    const cacheData = await redis.get(NETWORK_CACHE_KEY);
    if (cacheData) {
      const { result, timestamp } = cacheData as { result: boolean; timestamp: number };
      const now = Date.now();
      const age = now - timestamp;
      
      return {
        exists: true,
        key: NETWORK_CACHE_KEY,
        data: cacheData,
        timestamp: new Date(timestamp).toISOString(),
        age,
        ageFormatted: `${Math.round(age / 1000 / 60)} 分钟`,
        result
      };
    } else {
      return {
        exists: false,
        key: NETWORK_CACHE_KEY
      };
    }
  } catch (error) {
    return {
      exists: 'error',
      key: NETWORK_CACHE_KEY,
      error: String(error)
    };
  }
}

/**
 * 网络检测测试API端点
 */
export async function GET(req: NextRequest) {
  try {
    console.log('[网络测试] 开始执行...');
    const startTime = Date.now();
    
    // 获取Redis缓存信息
    const cacheInfo = await getRedisCacheInfo();
    
    // 执行检测
    console.log('[网络测试] 执行直接检测...');
    const directStartTime = Date.now();
    const directResult = await checkNetworkAccess();
    const directDuration = Date.now() - directStartTime;
    
    console.log('[网络测试] 执行缓存检测...');
    const cacheStartTime = Date.now();
    const cachedResult = await checkNetworkWithCache();
    const cacheDuration = Date.now() - cacheStartTime;
    
    // 检测区域
    console.log('[网络测试] 检测区域...');
    const region = await detectRegionByNetwork();
    
    // 再次获取Redis缓存信息（可能已更新）
    const updatedCacheInfo = await getRedisCacheInfo();
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    return NextResponse.json({
      success: true,
      data: {
        // 网络检测结果
        directCheck: {
          result: directResult,
          duration: `${directDuration}ms`
        },
        cachedCheck: {
          result: cachedResult,
          duration: `${cacheDuration}ms`,
          fromCache: cacheDuration < directDuration // 如果缓存检测明显快于直接检测，说明使用了缓存
        },
        detectedRegion: region,
        
        // 缓存信息
        cacheInfo: {
          before: cacheInfo,
          after: updatedCacheInfo
        },
        
        // 性能信息
        testDuration: `${duration}ms`,
        timestamp: new Date().toISOString(),
        
        // 请求信息
        requestInfo: {
          method: req.method,
          url: req.url
        }
      }
    }, { 
      status: 200,
      headers: corsHeaders
    });
  } catch (error: any) {
    console.error('[网络测试] 失败:', error);
    
    return NextResponse.json({
      success: false,
      error: {
        message: error.message || '内部服务器错误',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    }, { 
      status: 500,
      headers: corsHeaders
    });
  }
}

/**
 * 清除网络检测缓存
 */
export async function DELETE(req: NextRequest) {
  try {
    await clearNetworkCache();
    
    return NextResponse.json({
      success: true,
      message: '网络检测缓存已清除',
      timestamp: new Date().toISOString()
    }, { 
      status: 200,
      headers: corsHeaders
    });
  } catch (error: any) {
    console.error('[网络测试] 清除缓存失败:', error);
    
    return NextResponse.json({
      success: false,
      error: {
        message: error.message || '内部服务器错误'
      }
    }, { 
      status: 500,
      headers: corsHeaders
    });
  }
} 