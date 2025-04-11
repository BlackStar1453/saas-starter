'use server';

import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  NewUser,
  User,
  users,
} from '@/lib/db/schema';
import { comparePasswords, hashPassword, setSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createCheckoutSession } from '@/lib/payments/stripe';
import { getUser } from '@/lib/db/queries';
import {
  validatedAction,
  validatedActionWithUser,
} from '@/lib/auth/middleware';
import { sign } from 'jsonwebtoken';
import { getBaseUrl } from '@/lib/utils';

const JWT_SECRET = process.env.AUTH_SECRET || 'default_secret_change_this';

// 获取扩展认证信息
async function getExtensionAuthInfo(state: string) {
  try {
    console.log(`[扩展认证] 尝试获取认证信息，state: ${state}`);
    
    // 使用辅助函数获取基础URL
    const baseUrl = getBaseUrl();
    
    // 使用完整URL，确保在服务器端可以正常工作
    const apiUrl = `${baseUrl}/api/extension-auth/init?state=${state}`;
    console.log(`[扩展认证] 请求API: ${apiUrl}`);
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      // 确保不缓存结果
      cache: 'no-store',
      headers: {
        'Accept': 'application/json',
      },
      next: { revalidate: 0 }
    });
    
    console.log(`[扩展认证] API响应状态: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[扩展认证] API响应错误: ${errorText}`);
      throw new Error(`API响应错误(${response.status}): ${errorText}`);
    }
    
    const data = await response.json();
    console.log(`[扩展认证] API响应数据:`, data);
    
    if (!data.valid) {
      console.error(`[扩展认证] 无效的认证数据:`, data);
      throw new Error(`无效的认证数据: ${JSON.stringify(data)}`);
    }
    
    return data;
  } catch (error) {
    console.error('[扩展认证] 获取扩展认证信息失败:', error);
    // 记录详细的错误堆栈
    if (error instanceof Error) {
      console.error('[扩展认证] 错误堆栈:', error.stack);
    }
    return null;
  }
}

const signInSchema = z.object({
  email: z.string().email().min(3).max(255),
  password: z.string().min(8).max(100),
});

export const signIn = validatedAction(signInSchema, async (data, formData) => {
  const { email, password } = data;

  const userWithTeam = await db
    .select({
      user: users,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (userWithTeam.length === 0) {
    return {
      error: '邮箱或密码不正确，请重试。',
      email,
      password,
    };
  }

  const { user: foundUser } = userWithTeam[0];

  const isPasswordValid = await comparePasswords(
    password,
    foundUser.passwordHash,
  );

  if (!isPasswordValid) {
    return {
      error: '邮箱或密码不正确，请重试。',
      email,
      password,
    };
  }

  await Promise.all([
    setSession(foundUser),
  ]);

  // 检查是否是扩展授权请求
  const extensionAuthState = formData.get('extensionAuthState') as string | null;
  const extensionRedirectUri = formData.get('extensionRedirectUri') as string | null;
  
  console.log(`[扩展认证] 登录处理 - authState: ${extensionAuthState}, redirectUri: ${extensionRedirectUri}`);
  
  if (extensionAuthState) {
    console.log(`[扩展认证] 开始处理扩展授权请求`);
    
    try {
      // 获取扩展认证信息
      const extensionAuthInfo = await getExtensionAuthInfo(extensionAuthState);
      
      if (!extensionAuthInfo) {
        console.error(`[扩展认证] 获取认证信息失败, authState: ${extensionAuthState}`);
        return {
          error: '扩展认证失败，请重试。具体错误请查看控制台。',
          email,
          password,
        };
      }
      
      console.log(`[扩展认证] 获取认证信息成功:`, extensionAuthInfo);
      
      // 使用提供的重定向URI或从认证信息中获取
      const redirectUrl = extensionRedirectUri || extensionAuthInfo.redirectURL;
      console.log(`[扩展认证] 使用客户端重定向URL: ${redirectUrl}`);
      
      // 创建JWT令牌
      const token = sign(
        { 
          userId: foundUser.id,
          email: foundUser.email,
          name: foundUser.name || '',
          role: foundUser.role,
        },
        JWT_SECRET,
        { expiresIn: '30d' } // 扩展令牌有效期较长
      );

      // 对用户数据进行编码以便在URL中传递
      const userData = encodeURIComponent(JSON.stringify({
        id: foundUser.id,
        email: foundUser.email,
        name: foundUser.name,
        role: foundUser.role,
        premiumRequestsUsed: foundUser.premiumRequestsUsed,
        premiumRequestsLimit: foundUser.premiumRequestsLimit,
        fastRequestsUsed: foundUser.fastRequestsUsed,
        fastRequestsLimit: foundUser.fastRequestsLimit
      }));
      
      // 获取当前网站基础URL
      const baseUrl = getBaseUrl();
      const dashboardUrl = `${baseUrl}/dashboard`;
      
      // 构建内部成功页面URL (不使用扩展提供的重定向URL)
      const successPageUrl = `${baseUrl}/extension-auth-success?token=${encodeURIComponent(token)}&user_data=${userData}&state=${extensionAuthState}&client_redirect=${encodeURIComponent(redirectUrl || '')}&dashboard_url=${encodeURIComponent(dashboardUrl)}`;
      console.log(`[扩展认证] 内部成功页面URL: ${successPageUrl}`);
      
      // 不使用redirect函数，而是返回成功数据和重定向URL
      // 这里我们已经完成了网站登录，数据包含了dashboardUrl
      return {
        success: true,
        extensionAuth: {
          redirectUrl: successPageUrl,
          token,
          userData: JSON.parse(decodeURIComponent(userData)),
          state: extensionAuthState,
          dashboardUrl
        },
        email
      };
    } catch (error) {
      console.error('[扩展认证] 处理认证过程中出错:', error);
      return {
        error: '扩展认证处理失败，请重试',
        email,
        password,
      };
    }
  }

  const redirectTo = formData.get('redirect') as string | null;
  if (redirectTo === 'checkout') {
    const priceId = formData.get('priceId') as string;
    return createCheckoutSession({ user: foundUser, priceId });
  }

  redirect('/dashboard');
});

const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  inviteId: z.string().optional(),
});

export const signUp = validatedAction(signUpSchema, async (data, formData) => {
  const { email, password, inviteId } = data;

  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existingUser.length > 0) {
    return {
      error: '创建用户失败，请重试。',
      email,
      password,
    };
  }

  const passwordHash = await hashPassword(password);

  const newUser: NewUser = {
    email,
    passwordHash,
    role: 'owner', // Default role, will be overridden if there's an invitation
    premiumRequestsLimit: 0,
    fastRequestsUsed: 0,
    fastRequestsLimit: 50,
  };

  const [createdUser] = await db.insert(users).values(newUser).returning();

  if (!createdUser) {
    return {
      error: '创建用户失败，请重试。',
      email,
      password,
    };
  }

  let teamId: number;
  let userRole: string;

  await Promise.all([
    db.insert(users).values(createdUser),
    setSession(createdUser),
  ]);

  // 检查是否是扩展授权请求
  const extensionAuthState = formData.get('extensionAuthState') as string | null;
  
  if (extensionAuthState) {
    console.log(`[扩展认证] 开始处理注册后的扩展授权请求, state: ${extensionAuthState}`);
    
    try {
      // 获取扩展认证信息
      const extensionAuthInfo = await getExtensionAuthInfo(extensionAuthState);
      
      if (!extensionAuthInfo) {
        console.error(`[扩展认证] 获取认证信息失败, authState: ${extensionAuthState}`);
        return {
          error: '扩展认证失败，请重试。具体错误请查看控制台。',
          email,
          password,
        };
      }
      
      console.log(`[扩展认证] 获取认证信息成功:`, extensionAuthInfo);
      
      // 使用提供的重定向URI或从认证信息中获取
      const redirectUrl = extensionAuthInfo.redirectURL;
      console.log(`[扩展认证] 使用客户端重定向URL: ${redirectUrl}`);
      
      // 创建JWT令牌
      const token = sign(
        { 
          userId: createdUser.id,
          email: createdUser.email,
          name: createdUser.name || '',
          role: createdUser.role,
        },
        JWT_SECRET,
        { expiresIn: '30d' } // 扩展令牌有效期较长
      );

      // 对用户数据进行编码以便在URL中传递
      const userData = encodeURIComponent(JSON.stringify({
        id: createdUser.id,
        email: createdUser.email,
        name: createdUser.name,
        role: createdUser.role,
        premiumRequestsUsed: createdUser.premiumRequestsUsed,
        premiumRequestsLimit: createdUser.premiumRequestsLimit,
        fastRequestsUsed: createdUser.fastRequestsUsed,
        fastRequestsLimit: createdUser.fastRequestsLimit
      }));
      
      // 获取当前网站基础URL
      const baseUrl = getBaseUrl();
      const dashboardUrl = `${baseUrl}/dashboard`;
      
      // 构建内部成功页面URL (不使用扩展提供的重定向URL)
      const successPageUrl = `${baseUrl}/extension-auth-success?token=${encodeURIComponent(token)}&user_data=${userData}&state=${extensionAuthState}&client_redirect=${encodeURIComponent(redirectUrl || '')}&dashboard_url=${encodeURIComponent(dashboardUrl)}`;
      console.log(`[扩展认证] 内部成功页面URL: ${successPageUrl}`);
      
      // 不使用redirect函数，而是返回成功数据和重定向URL
      // 这里我们已经完成了网站登录，数据包含了dashboardUrl
      return {
        success: true,
        extensionAuth: {
          redirectUrl: successPageUrl,
          token,
          userData: JSON.parse(decodeURIComponent(userData)),
          state: extensionAuthState,
          dashboardUrl
        },
        email
      };
    } catch (error) {
      console.error('[扩展认证] 处理认证过程中出错:', error);
      return {
        error: '扩展认证处理失败，请重试',
        email,
        password,
      };
    }
  }

  const redirectTo = formData.get('redirect') as string | null;
  if (redirectTo === 'checkout') {
    const priceId = formData.get('priceId') as string;
    return createCheckoutSession({ user: createdUser, priceId });
  }

  redirect('/dashboard');
});

export async function signOut() {
  (await cookies()).delete('session');
}

const updatePasswordSchema = z
  .object({
    currentPassword: z.string().min(8).max(100),
    newPassword: z.string().min(8).max(100),
    confirmPassword: z.string().min(8).max(100),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

export const updatePassword = validatedActionWithUser(
  updatePasswordSchema,
  async (data, _, user) => {
    const { currentPassword, newPassword } = data;

    const isPasswordValid = await comparePasswords(
      currentPassword,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      return { error: 'Current password is incorrect.' };
    }

    if (currentPassword === newPassword) {
      return {
        error: 'New password must be different from the current password.',
      };
    }

    const newPasswordHash = await hashPassword(newPassword);

    await Promise.all([
      db
        .update(users)
        .set({ passwordHash: newPasswordHash })
        .where(eq(users.id, user.id)),
    ]);

    return { success: 'Password updated successfully.' };
  },
);

const deleteAccountSchema = z.object({
  password: z.string().min(8).max(100),
});

export const deleteAccount = validatedActionWithUser(
  deleteAccountSchema,
  async (data, _, user) => {
    const { password } = data;

    const isPasswordValid = await comparePasswords(password, user.passwordHash);
    if (!isPasswordValid) {
      return { error: 'Incorrect password. Account deletion failed.' };
    }


    // Soft delete
    await db
      .update(users)
      .set({
        deletedAt: sql`CURRENT_TIMESTAMP`,
        email: sql`CONCAT(email, '-', id, '-deleted')`, // Ensure email uniqueness
      })
      .where(eq(users.id, user.id));



    (await cookies()).delete('session');
    redirect('/sign-in');
  },
);

const updateAccountSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email address'),
});

export const updateAccount = validatedActionWithUser(
  updateAccountSchema,
  async (data, _, user) => {
    const { name, email } = data;

    await Promise.all([
      db.update(users).set({ name, email }).where(eq(users.id, user.id)),
    ]);

    return { success: 'Account updated successfully.' };
  },
);
