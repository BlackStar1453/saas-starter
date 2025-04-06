import { db } from './drizzle';
import { users } from './schema';
import { hashPassword } from '@/lib/auth/session';

async function seed() {
  console.log('开始填充用户数据...');
  
  const email = 'test@test.com';
  const password = 'admin123';
  const passwordHash = await hashPassword(password);

  const [user] = await db
    .insert(users)
    .values([
      {
        email: email,
        name: '测试用户',
        passwordHash: passwordHash,
        role: "admin",
      },
    ])
    .returning();

  console.log('初始用户创建成功:', user);
}

seed()
  .catch((error) => {
    console.error('填充数据失败:', error);
    process.exit(1);
  })
  .finally(() => {
    console.log('填充数据完成。退出...');
    process.exit(0);
  });
