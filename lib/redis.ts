import { Redis } from '@upstash/redis';

// 创建单例Redis客户端实例
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

// 导出Redis客户端实例供其他模块使用
export default redis; 