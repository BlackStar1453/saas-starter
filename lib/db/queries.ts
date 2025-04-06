import { desc, and, eq, isNull, lt, sql } from 'drizzle-orm';
import { db } from './drizzle';
import { users } from './schema';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth/session';

export async function getUser() {
  const sessionCookie = (await cookies()).get('session');
  if (!sessionCookie || !sessionCookie.value) {
    return null;
  }

  const sessionData = await verifyToken(sessionCookie.value);
  if (
    !sessionData ||
    !sessionData.user ||
    typeof sessionData.user.id !== 'number'
  ) {
    return null;
  }

  if (new Date(sessionData.expires) < new Date()) {
    return null;
  }

  const user = await db
    .select()
    .from(users)
    .where(and(eq(users.id, sessionData.user.id), isNull(users.deletedAt)))
    .limit(1);

  if (user.length === 0) {
    return null;
  }

  // 检查是否需要重置用量统计（每30天）
  if (user[0].usageLastResetAt) {
    const lastReset = new Date(user[0].usageLastResetAt);
    const now = new Date();
    const daysSinceReset = (now.getTime() - lastReset.getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysSinceReset >= 30) {
      await resetUserUsage(user[0].id);
      user[0].premiumRequestsUsed = 0;
      user[0].fastRequestsUsed = 0;
      user[0].usageLastResetAt = now;
    }
  }

  return user[0];
}

// 用户基本操作
export async function getUserById(userId: number) {
  const result = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function getUserByEmail(email: string) {
  const result = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt)))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function updateUser(
  userId: number,
  userData: {
    name?: string;
    email?: string;
    role?: string;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    stripeProductId?: string | null;
    planName?: string | null;
    subscriptionStatus?: string | null;
  }
) {
  await db
    .update(users)
    .set({
      ...userData,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

// 用量统计相关操作
export async function incrementPremiumRequests(userId: number) {
  await db
    .update(users)
    .set({
      premiumRequestsUsed: sql`${users.premiumRequestsUsed} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

export async function incrementFastRequests(userId: number) {
  await db
    .update(users)
    .set({
      fastRequestsUsed: sql`${users.fastRequestsUsed} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

export async function resetUserUsage(userId: number) {
  await db
    .update(users)
    .set({
      premiumRequestsUsed: 0,
      fastRequestsUsed: 0,
      usageLastResetAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

// 检查用户是否超出配额
export async function isPremiumRequestsQuotaExceeded(userId: number): Promise<boolean> {
  const user = await getUserById(userId);
  if (!user) return true;
  
  return (user.premiumRequestsUsed ?? 0) >= (user.premiumRequestsLimit ?? 50);
}

// 检查用户快速请求是否超出配额
export async function isFastRequestsQuotaExceeded(userId: number): Promise<boolean> {
  const user = await getUserById(userId);
  if (!user) return true;
  
  return (user.fastRequestsUsed ?? 0) >= (user.fastRequestsLimit ?? 150);
}
