const { exec } = require('node:child_process');
const { promisify } = require('node:util');

const execAsync = promisify(exec);

async function migrate() {
  console.log('生成数据库迁移文件...');
  
  try {
    
    // 生成迁移文件
    await execAsync('npx drizzle-kit generate:pg --schema=./lib/db/schema.ts --out=./lib/db/migrations');
    console.log('迁移文件生成成功！');
    
    // 应用迁移
    console.log('应用数据库迁移...');
    await execAsync('npx drizzle-kit migrate:apply');
    console.log('数据库迁移应用成功！');
  } catch (error) {
    console.error('迁移过程中发生错误:', error);
    process.exit(1);
  }
}

migrate()
  .catch(console.error)
  .finally(() => {
    console.log('迁移过程完成。');
  }); 