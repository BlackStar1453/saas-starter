import { db } from './db/drizzle';
import { users } from './db/schema';
import { eq } from 'drizzle-orm';

export interface UsageStatus {
  premiumRequests: {
    used: number;
    limit: number;
    remaining: number;
  };
  fastRequests: {
    used: number;
    limit: number;
    remaining: number;
  };
  lastResetAt: Date;
}

export class UsageError extends Error {
  constructor(
    message: string,
    public code: string = 'USAGE_ERROR',
    public status: number = 403
  ) {
    super(message);
    this.name = 'UsageError';
  }
}

export async function getUserUsage(userId: number): Promise<UsageStatus> {
  const user = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .then(rows => rows[0]);

  if (!user) {
    throw new UsageError('User not found', 'USER_NOT_FOUND', 404);
  }

  return {
    premiumRequests: {
      used: user.premiumRequestsUsed ?? 0,
      limit: user.premiumRequestsLimit ?? 50,
      remaining: (user.premiumRequestsLimit ?? 50) - (user.premiumRequestsUsed ?? 0)
    },
    fastRequests: {
      used: user.fastRequestsUsed ?? 0,
      limit: user.fastRequestsLimit ?? 150,
      remaining: (user.fastRequestsLimit ?? 150) - (user.fastRequestsUsed ?? 0)
    },
    lastResetAt: user.usageLastResetAt ?? new Date()
  };
}

export async function checkAndUpdateUsage(
  userId: number,
  type: 'premium' | 'fast' 
): Promise<void> {
  const user = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .then(rows => rows[0]);

  if (!user) {
    throw new UsageError('User not found', 'USER_NOT_FOUND', 404);
  }

  // 如果用户的计划是订阅，检查是否需要重置使用量（每30天）
  const now = new Date();
  const lastReset = user.usageLastResetAt ?? now;
  const daysSinceReset = (now.getTime() - lastReset.getTime()) / (1000 * 60 * 60 * 24);
  const isSubscription = user.subscriptionStatus === 'active';

  if (isSubscription && daysSinceReset >= 30) {
    await db
      .update(users)
      .set({
        premiumRequestsUsed: 0,
        fastRequestsUsed: 0,
        usageLastResetAt: now,
      })
      .where(eq(users.id, userId));
    return;
  }

  // 映射模型类型到请求类型
  let requestType: 'premium' | 'fast';
  if (type === 'advanced' || type === 'premium') {
    requestType = 'premium';
  } else {
    requestType = 'fast';
  }

  // 检查使用量限制
  if (requestType === 'premium' && (user.premiumRequestsUsed ?? 0) >= (user.premiumRequestsLimit ?? 50)) {
    throw new UsageError(
      '高级模型使用次数已达上限',
      'PREMIUM_LIMIT_EXCEEDED'
    );
  }

  if (requestType === 'fast' && (user.fastRequestsUsed ?? 0) >= (user.fastRequestsLimit ?? 150)) {
    throw new UsageError(
      '基础模型使用次数已达上限',
      'BASIC_LIMIT_EXCEEDED'
    );
  }

  // 更新使用量
  await db
    .update(users)
    .set({
      ...(requestType === 'premium'
        ? { premiumRequestsUsed: (user.premiumRequestsUsed ?? 0) + 1 }
        : { fastRequestsUsed: (user.fastRequestsUsed ?? 0) + 1 }),
      updatedAt: now
    })
    .where(eq(users.id, userId));
} 