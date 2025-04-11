# AI 扩展服务需求文档

## 1. 系统概述

本系统是一个基于浏览器扩展的 AI 服务，支持两种模式：
- 用户自有引擎模式（高级用户）
- 平台托管模式（基础用户）

## 2. 详细需求

### 2.1 客户端（浏览器扩展）功能

#### 2.1.1 用户自有引擎模式（Premium 请求）
- 检查用户是否配置了自己的引擎
- 向 `/api/hasEngine` 发送 POST 请求
  - 使用 auth-service.js 中的认证机制（JWT）
  - 包含使用的模型信息
- 验证响应后调用 OpenAI API
- 更新 premiumRequestsUsed 计数
- 展示响应结果

#### 2.1.2 平台托管模式（Fast 请求）
- 向 `/api/hasNotEngine` 发送 POST 请求
  - 使用 auth-service.js 中的认证机制（JWT）
  - 包含查询内容
- 更新 fastRequestsUsed 计数
- 直接展示服务器返回的响应

### 2.2 服务器端功能

#### 2.2.1 用户管理
- 用户注册与认证
- 角色管理（member/admin）
- Stripe 订阅集成
  - 客户 ID
  - 订阅 ID
  - 产品 ID
  - 计划名称
  - 订阅状态

#### 2.2.2 使用量管理
- Premium 请求管理
  - 使用量统计 (premiumRequestsUsed)
  - 使用限制 (premiumRequestsLimit)
- Fast 请求管理
  - 使用量统计 (fastRequestsUsed)
  - 使用限制 (fastRequestsLimit)
- 使用量重置机制 (usageLastResetAt)

#### 2.2.3 API 功能
- 用户认证验证
- 使用量检查
- 请求类型判断
- 计数更新
- 响应处理

## 3. 系统架构

### 3.1 技术栈
- 前端：Chrome Extension
- 后端：NextJS
- 认证：JWT (auth-service.js)
- 数据库：PostgreSQL (Drizzle ORM)
- 支付：Stripe

### 3.2 数据模型

```typescript
// 用户模型
interface User {
  id: number;
  name: string | null;
  email: string;
  passwordHash: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  
  // Stripe 相关
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeProductId: string | null;
  planName: string | null;
  subscriptionStatus: string | null;
  
  // 使用量相关
  premiumRequestsUsed: number;
  premiumRequestsLimit: number;
  fastRequestsUsed: number;
  fastRequestsLimit: number;
  usageLastResetAt: Date;
}

// API 请求格式
interface BaseRequest {
  auth: {
    token: string;
  };
}

interface HasEngineRequest extends BaseRequest {
  model: string;
  query: string;
}

interface HasNotEngineRequest extends BaseRequest {
  query: string;
}

// API 响应格式
interface BaseResponse {
  success: boolean;
  message?: string;
  error?: {
    code: string;
    message: string;
  };
}

interface HasEngineResponse extends BaseResponse {
  canProceed: boolean;
  remainingPremiumRequests?: number;
}

interface HasNotEngineResponse extends BaseResponse {
  content: string;
  remainingFastRequests?: number;
}
```

### 3.3 API 端点

#### 3.3.1 认证相关
- POST `/api/auth/login`
- POST `/api/auth/register`
- POST `/api/auth/logout`

#### 3.3.2 AI 服务相关
- POST `/api/hasEngine`
- POST `/api/hasNotEngine`

#### 3.3.3 使用量相关
- GET `/api/usage/status`
- POST `/api/usage/reset`

### 3.4 安全措施
1. 所有 API 请求使用 HTTPS
2. 密码哈希存储
3. JWT 认证
4. 请求频率限制
5. 环境变量管理敏感信息

### 3.5 错误处理
1. 认证错误：401 Unauthorized
2. 额度超限：403 Forbidden
   - Premium 额度超限
   - Fast 额度超限
3. 服务器错误：500 Internal Server Error

## 4. 实现步骤

1. 数据库设置
   - 创建用户表
   - 设置 Drizzle ORM
   - 实现数据迁移

2. 认证系统
   - 实现 auth-service.js 集成
   - 设置 JWT 中间件
   - 实现用户认证流程

3. 使用量管理
   - 实现请求计数逻辑
   - 设置使用量限制
   - 实现重置机制

4. API 开发
   - 实现 hasEngine 端点
   - 实现 hasNotEngine 端点
   - 集成 OpenAI API

5. 扩展开发
   - 集成认证系统
   - 实现请求处理
   - 开发用户界面

6. 测试部署
   - 单元测试
   - 集成测试
   - 部署配置
   - 监控设置 