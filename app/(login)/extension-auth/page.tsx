'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Login } from '../login';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

export default function ExtensionAuthPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const state = searchParams.get('state');
  const redirectUri = searchParams.get('redirect_uri');
  const [error, setError] = useState<string | null>(null);
  
  console.log(`[扩展认证页面] 参数: state=${state}, redirect_uri=${redirectUri}`);
  
  // 如果没有state参数，显示错误并稍后重定向
  useEffect(() => {
    if (!state) {
      console.log('[扩展认证页面] 缺少state参数，即将重定向到登录页');
      setError('缺少必要的认证参数，即将跳转到普通登录页...');
      
      // 3秒后重定向
      const timer = setTimeout(() => {
        router.replace('/sign-in');
      }, 3000);
      
      return () => clearTimeout(timer);
    }
  }, [state, router]);

  // 使用通用登录组件，但添加扩展相关的隐藏字段
  return (
    <>
      <div className="fixed top-4 left-0 right-0 bg-orange-500 text-white py-2 px-4 text-center">
        <p>您正在为浏览器扩展授权登录</p>
      </div>
      
      {error && (
        <div className="fixed top-16 left-0 right-0 mx-auto max-w-md">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>认证错误</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      )}
      
      {!error && (
        <Login 
          mode="signin" 
          extensionAuth={{ state, redirectUri }} 
        />
      )}
    </>
  );
} 