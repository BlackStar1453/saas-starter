import redis from './redis';

// 单一测试端点
const TEST_ENDPOINT = 'https://api.openai.com/v1/models'; // OpenAI API检测

// 缓存键
const NETWORK_CACHE_KEY = 'network:access:check';

// 超时设置(毫秒)
const TIMEOUT = 3000;

// 缓存有效期（秒）
const CACHE_TTL = 6 * 60 * 60; // 6小时

/**
 * 检测网络连通性
 * @returns Promise<boolean> - 如果能连接到OpenAI API则返回true
 */
export const checkNetworkAccess = async (): Promise<boolean> => {
  // 创建AbortController用于取消请求
  const controller = new AbortController();
  
  try {
    // 设置超时
    const timeoutId = setTimeout(() => {
      controller.abort();
      console.log(`[网络检测] 请求超时 (${TIMEOUT}ms)`);
    }, TIMEOUT);
    
    // 创建测试请求
    const response = await fetch(TEST_ENDPOINT, {
      method: 'HEAD', // 只检查头信息，不下载内容
      mode: 'no-cors', // 允许跨域请求
      signal: controller.signal,
      cache: 'no-store' // 不使用缓存
    });
    
    // 清除超时计时器
    clearTimeout(timeoutId);
    
    console.log(`[网络检测] 成功连接到OpenAI API`);
    return true;
  } catch (error) {
    console.log(`[网络检测] 无法连接到OpenAI API: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
};

/**
 * 检测网络并缓存结果
 * @returns Promise<boolean>
 */
export const checkNetworkWithCache = async (): Promise<boolean> => {
  try {
    // 从Redis读取缓存
    const cachedData = await redis.get(NETWORK_CACHE_KEY) as { 
      result: boolean; 
      timestamp: number; 
    } | null;
    
    const now = Date.now();
    
    // 如果缓存存在且未过期
    if (cachedData && cachedData.timestamp) {
      const cacheAge = now - cachedData.timestamp;
      const isValid = cacheAge < (CACHE_TTL * 1000);
      
      if (isValid) {
        console.log(`[网络检测] 使用Redis缓存结果: ${cachedData.result}, 缓存时间: ${new Date(cachedData.timestamp).toISOString()}`);
        return cachedData.result;
      } else {
        console.log(`[网络检测] 缓存已过期, 时间: ${new Date(cachedData.timestamp).toISOString()}`);
      }
    } else {
      console.log('[网络检测] 缓存未命中');
    }
    
    // 执行新的检测
    console.log('[网络检测] 执行新检测...');
    const result = await checkNetworkAccess();
    
    // 更新Redis缓存
    const newCacheData = {
      result,
      timestamp: now
    };
    
    // 设置缓存，带有过期时间
    await redis.set(NETWORK_CACHE_KEY, newCacheData, { ex: CACHE_TTL });
    
    console.log(`[网络检测] 新检测结果: ${result}, 已更新Redis缓存`);
    return result;
    
  } catch (error) {
    // Redis出错时回退到直接检测
    console.error('[网络检测] Redis缓存错误:', error);
    console.log('[网络检测] 回退到直接检测...');
    return await checkNetworkAccess();
  }
};

/**
 * 判断是否可以访问国际服务
 * @returns Promise<boolean> - 返回true表示可以访问国际服务
 */
export const canAccessInternationalServices = async (): Promise<boolean> => {
  return await checkNetworkWithCache();
};

/**
 * 根据网络检测结果判断用户区域
 * @returns Promise<string> - 返回区域代码，如'CN'或'GLOBAL'
 */
export const detectRegionByNetwork = async (): Promise<string> => {
  const canAccess = await canAccessInternationalServices();
  return canAccess ? 'GLOBAL' : 'CN';
};

/**
 * 手动清除网络检测缓存
 * 当需要立即重新检测网络状况时使用
 */
export const clearNetworkCache = async (): Promise<void> => {
  try {
    await redis.del(NETWORK_CACHE_KEY);
    console.log('[网络检测] 缓存已清除');
  } catch (error) {
    console.error('[网络检测] 清除缓存失败:', error);
  }
}; 