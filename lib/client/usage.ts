// 客户端工具函数，用于更新和获取用量

// 更新premium请求用量
export async function trackPremiumRequest() {
  try {
    const response = await fetch('/api/usage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type: 'premium' }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("Error tracking premium request:", error);
      
      if (response.status === 403) {
        return { 
          success: false, 
          error: "配额已用完，请升级您的订阅或等待下月重置",
          quotaExceeded: true
        };
      }
      
      return { success: false, error: error.error || "Failed to track request" };
    }

    const data = await response.json();
    return { 
      success: true, 
      usedCount: data.usedCount,
      limit: data.limit
    };
  } catch (error) {
    console.error("Error tracking premium request:", error);
    return { success: false, error: "Failed to track request" };
  }
}

// 更新fast请求用量
export async function trackFastRequest() {
  try {
    const response = await fetch('/api/usage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type: 'fast' }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("Error tracking fast request:", error);
      
      if (response.status === 403) {
        return { 
          success: false, 
          error: "快速请求配额已用完，请等待下月重置",
          quotaExceeded: true
        };
      }
      
      return { success: false, error: error.error || "Failed to track request" };
    }

    const data = await response.json();
    return { 
      success: true, 
      usedCount: data.usedCount,
      limit: data.limit
    };
  } catch (error) {
    console.error("Error tracking fast request:", error);
    return { success: false, error: "Failed to track request" };
  }
}

// 获取用量统计
export async function getUsageStats() {
  try {
    const response = await fetch('/api/usage');
    
    if (!response.ok) {
      const error = await response.json();
      console.error("Error fetching usage stats:", error);
      return { success: false, error: error.error || "Failed to fetch usage stats" };
    }

    const data = await response.json();
    return { 
      success: true, 
      premium: data.premium,
      fast: data.fast
    };
  } catch (error) {
    console.error("Error fetching usage stats:", error);
    return { success: false, error: "Failed to fetch usage stats" };
  }
} 