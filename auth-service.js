// 扩展认证服务
class AuthService {
  constructor() {
    // 后端API的基础URL
    this.apiBaseUrl = 'http://localhost:3000'; // 开发环境
    // this.apiBaseUrl = 'https://your-production-domain.com'; // 生产环境
    
    // 存储认证状态的键
    this.AUTH_STORAGE_KEY = 'auth_data';
  }

  /**
   * 启动认证流程
   * @returns {Promise<void>}
   */
  async startAuthFlow() {
    try {
      // 生成扩展ID和回调URL
      const extensionId = chrome.runtime.id;
      const redirectURL = chrome.identity.getRedirectURL();
      
      // 调用后端API初始化认证流程
      const response = await fetch(`${this.apiBaseUrl}/api/extension-auth/init`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          extensionId,
          redirectURL
        })
      });
      
      if (!response.ok) {
        throw new Error('认证初始化失败');
      }
      
      const { authUrl, state } = await response.json();
      
      // 存储认证状态
      await chrome.storage.local.set({ 'authState': state });
      
      // 打开认证页面
      const authPageUrl = `${this.apiBaseUrl}${authUrl}`;
      chrome.tabs.create({ url: authPageUrl });
      
    } catch (error) {
      console.error('启动认证流程失败:', error);
      throw error;
    }
  }

  /**
   * 保存认证数据
   * @param {Object} authData - 认证数据
   * @returns {Promise<void>}
   */
  async saveAuthData(authData) {
    return chrome.storage.local.set({
      [this.AUTH_STORAGE_KEY]: JSON.stringify(authData)
    });
  }

  /**
   * 获取认证数据
   * @returns {Promise<Object|null>}
   */
  async getAuthData() {
    const data = await chrome.storage.local.get(this.AUTH_STORAGE_KEY);
    try {
      return data[this.AUTH_STORAGE_KEY] ? JSON.parse(data[this.AUTH_STORAGE_KEY]) : null;
    } catch (error) {
      console.error('解析认证数据失败:', error);
      return null;
    }
  }

  /**
   * 检查用户是否已认证
   * @returns {Promise<boolean>}
   */
  async isAuthenticated() {
    const authData = await this.getAuthData();
    return !!authData && !!authData.token;
  }

  /**
   * 注销登录
   * @returns {Promise<void>}
   */
  async logout() {
    return chrome.storage.local.remove(this.AUTH_STORAGE_KEY);
  }
}

// 导出服务实例
export const authService = new AuthService(); 