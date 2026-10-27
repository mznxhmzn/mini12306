/** API 请求统一封装：认证、错误提示与过期登录处理。 */
(function (global) {
  const projectUrl = new URL('../', document.currentScript.src);
  const baseUrl = global.MINI12306_API_URL || (location.port === '5500' ? 'http://localhost:3000/api' : `${location.origin}/api`);
  const storage = global.Mini12306Storage;
  let lastActivity = Date.now();
  function page(path) { return new URL(path, projectUrl).href; }
  function logout() { storage.clearSession(); location.replace(page('pages/login.html')); }
  async function request(path, options = {}) {
    const headers = {'Content-Type': 'application/json', ...options.headers};
    const token = storage.getData('token');
    if (token) headers.Authorization = `Bearer ${token}`;
    if (!options.passive) headers['X-User-Activity'] = '1';
    let response;
    try { response = await fetch(`${baseUrl}${path}`, {...options, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body)}); }
    catch { throw new Error('无法连接服务器，请确认 API 已启动'); }
    const data = response.status === 204 ? {} : await response.json();
    if (!response.ok) {
      if (response.status === 401 && !path.startsWith('/auth/login') && !path.startsWith('/auth/register')) logout();
      const error = new Error(data.error?.message || '请求失败'); error.status = response.status; throw error;
    }
    return data;
  }
  function saveSession(data) {
    if (!storage.setData('token', data.token) || !storage.setData('currentUser', {...data.user, lastActiveAt: new Date().toISOString()})) { storage.clearSession(); throw new Error('浏览器无法保存登录状态'); }
  }
  // 用户操作才向后端报告活动，静默轮询不延长登录会话。
  let lastReported = 0;
  for (const event of ['click', 'keydown', 'touchstart', 'scroll']) document.addEventListener(event, () => {
    lastActivity = Date.now();
    if (!/\/(login|register)\.html$/.test(location.pathname) && storage.getData('token') && lastActivity - lastReported > 15000) {
      lastReported = lastActivity;
      request('/auth/activity', {method: 'POST'}).catch(error => global.Mini12306Utils?.showToast(error.message));
    }
  }, {passive: true});
  setInterval(() => { if (storage.getData('token') && Date.now() - lastActivity >= 30 * 60000) logout(); }, 15000);
  global.Mini12306API = {request, page, logout, saveSession};
})(window);
