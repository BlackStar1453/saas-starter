// 浏览器扩展认证处理示例代码
// 这段代码应该放在扩展的背景脚本(background.js)中

// 认证起始点 - 当用户点击登录按钮时调用
async function startAuthentication() {
  try {
    // 生成随机状态用于CSRF保护
    const state = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    
    // 保存状态以便后续验证
    await browser.storage.local.set({ authState: state });
    
    // 服务器API的URL，初始化认证流程
    const apiUrl = 'http://localhost:3000/api/extension-auth';
    
    // 调用API初始化认证
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        extensionId: 'your-extension-id',
        redirectURL: browser.identity.getRedirectURL() // 获取扩展的重定向URL
      })
    });
    
    if (!response.ok) {
      throw new Error(`API错误: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.success || !data.authUrl) {
      throw new Error('初始化认证失败');
    }
    
    // 打开认证页面
    browser.tabs.create({
      url: `http://localhost:3000${data.authUrl}`
    });
    
    console.log('[扩展] 已打开认证页面');
  } catch (error) {
    console.error('[扩展] 启动认证流程失败:', error);
  }
}

// 监听标签页更新，查找认证结果页面
browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // 只处理完成加载的标签页
  if (changeInfo.status !== 'complete' || !tab.url) {
    return;
  }
  
  // 检查是否是认证结果页面
  if (tab.url.includes('extension-auth-success')) {
    console.log('[扩展] 检测到认证结果页面:', tab.url);
    
    try {
      // 直接从URL中解析参数，不需要注入脚本
      const url = new URL(tab.url);
      const params = new URLSearchParams(url.search);
      
      // 获取所有需要的参数
      const token = params.get('token');
      const userData = params.get('user_data');
      const state = params.get('state');
      const dashboardUrl = params.get('dashboard_url');
      
      // 检查参数完整性
      if (!token || !userData || !state) {
        console.error('[扩展] URL参数不完整');
        return;
      }
      
      // 验证状态匹配
      const { authState } = await browser.storage.local.get('authState');
      if (state !== authState) {
        console.error(`[扩展] 状态不匹配：收到${state}，预期${authState}`);
        return;
      }
      
      // 解析用户数据
      let userInfo;
      try {
        userInfo = JSON.parse(decodeURIComponent(userData));
      } catch (e) {
        console.error('[扩展] 解析用户数据失败:', e);
        return;
      }
      
      // 保存认证信息
      await browser.storage.local.set({
        userInfo: JSON.stringify(userInfo),
        authToken: token
      });
      
      console.log('[扩展] 认证信息已保存:', userInfo);
      
      // 通知扩展其他部分认证成功
      browser.runtime.sendMessage({
        type: 'AUTH_SUCCESS',
        data: {
          user: userInfo,
          token: token
        }
      });
      
      // 不立即关闭认证标签页，等待它自动重定向到仪表板
      // 标签页会自动重定向到仪表板，用户可以在网站上保持登录状态
      // 如果要强制关闭，取消下面注释：
      // browser.tabs.remove(tabId);
      
      // 清除存储的authState
      browser.storage.local.remove('authState');
    } catch (error) {
      console.error('[扩展] 处理认证结果失败:', error);
    }
  }
});

// 方法二：使用内容脚本监听自定义事件 (content_script.js)
// 这段代码应该放在扩展的内容脚本中
function setupAuthListener() {
  // 仅在认证结果页面执行
  if (window.location.href.includes('extension-auth-success')) {
    console.log('[内容脚本] 在认证结果页面中运行');
    
    // 监听认证完成事件
    window.addEventListener('extension-auth-complete', (event) => {
      console.log('[内容脚本] 接收到认证完成事件:', event.detail);
      
      // 将认证结果发送到背景脚本
      chrome.runtime.sendMessage({
        type: 'AUTH_RESULT',
        data: event.detail
      });
    });
    
    // 检查页面是否已经有认证结果
    if (window.authResult) {
      console.log('[内容脚本] 页面已有认证结果:', window.authResult);
      
      // 将认证结果发送到背景脚本
      chrome.runtime.sendMessage({
        type: 'AUTH_RESULT',
        data: window.authResult
      });
    }
  }
}

// 在内容脚本加载时立即执行
setupAuthListener(); 