import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 获取应用的基础URL，适用于客户端和服务器端环境
 * @returns 应用的完整基础URL，包含协议和主机名
 */
export function getBaseUrl() {
  // 优先使用环境变量中的应用URL
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }

  // Vercel部署环境
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // 开发环境默认
  return 'http://localhost:3000';
}
