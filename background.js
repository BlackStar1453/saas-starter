// 导入认证服务
import { authService } from './auth-service';

// 处理认证结果消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'AUTH_RESULT') {
    handleAuthResult(message.payload);
  }
});

// 处理认证结果
async function handleAuthResult(payload) {
  try {
    const { token, userData, state } = payload;
    
    // 验证状态以确保是我们的认证请求
    const { authState } = await chrome.storage.local.get('authState');
    
    if (state !== authState) {
      console.error('状态验证失败，可能存在CSRF攻击');
      // 发送错误消息到扩展的其他部分
      chrome.runtime.sendMessage({
        type: 'AUTH_ERROR',
        payload: { error: '认证失败：状态验证错误' }
      });
      return;
    }
    
    // 存储认证信息
    await authService.saveAuthData({
      token,
      user: userData
    });
    
    // 通知扩展中的其他部分认证成功
    chrome.runtime.sendMessage({
      type: 'AUTH_SUCCESS',
      payload: { user: userData }
    });
    
    // 可以选择性地打开扩展的弹出窗口
    // chrome.action.openPopup();
    
    // 清除认证状态
    chrome.storage.local.remove('authState');
    
  } catch (error) {
    console.error('处理认证结果时出错:', error);
    chrome.runtime.sendMessage({
      type: 'AUTH_ERROR',
      payload: { error: '处理认证数据时出错' }
    });
  }
}

// 扩展安装或更新后的事件处理
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // 扩展首次安装时可以提示用户登录
    console.log('扩展已安装，可以引导用户登录');
  }
});

// 监听来自扩展的认证请求
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_AUTH') {
    authService.startAuthFlow()
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // 表示会异步发送响应
  }
  
  if (message.type === 'CHECK_AUTH') {
    authService.isAuthenticated()
      .then((isAuthenticated) => {
        sendResponse({ isAuthenticated });
      })
      .catch((error) => {
        sendResponse({ isAuthenticated: false, error: error.message });
      });
    return true; // 表示会异步发送响应
  }
  
  if (message.type === 'LOGOUT') {
    authService.logout()
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // 表示会异步发送响应
  }
}); 