/** 页面角色检查来自 /auth/me，不信任浏览器中的角色。 */
(function (global) {
  const api = global.Mini12306API;
  const storage = global.Mini12306Storage;
  const home = role => ({passenger: 'index.html', clerk: 'pages/clerk/dashboard.html', admin: 'pages/admin/dashboard.html'})[role] || 'pages/login.html';
  const currentPath = new URL(location.href).pathname;
  const publicPage = /\/(login|register)\.html$/.test(currentPath);
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  async function guard() {
    if (publicPage) { resolveReady(null); return; }
    document.body.style.visibility = 'hidden';
    try {
      if (!storage.getData('token')) { api.logout(); resolveReady(null); return; }
      const {user} = await api.request('/auth/me', {passive: true});
      storage.setData('currentUser', {...user, lastActiveAt: new Date().toISOString()});
      const requiredRole = document.body.dataset.role || 'passenger';
      if (user.role !== requiredRole) { location.replace(api.page(home(user.role))); resolveReady(null); return; }
      document.body.style.visibility = '';
      renderTabs(user.role);
      document.querySelectorAll('[data-current-user-name]').forEach(element => { element.textContent = user.realNameMasked || user.account; });
      document.querySelectorAll('[data-action="logout"]').forEach(element => element.addEventListener('click', event => { event.preventDefault(); api.logout(); }));
      resolveReady(user);
    } catch (error) {
      document.body.style.visibility = '';
      global.Mini12306Utils.showToast(error.message);
      const notice = document.createElement('div'); notice.className = 'notice-box'; notice.textContent = '认证检查失败，请重试或重新登录。';
      const button = document.createElement('button'); button.className = 'secondary-button'; button.textContent = '重新登录'; button.onclick = api.logout; notice.append(button); document.body.prepend(notice);
      resolveReady(null);
    }
  }
  function renderTabs(role) {
    const items = role === 'passenger' ? [['index.html', '首', '首页'], ['pages/orders.html', '单', '订单'], ['pages/profile.html', '我', '我的']] : role === 'admin' ? [['pages/admin/dashboard.html', '管', '管理'], ['pages/admin/trains.html', '车', '车次'], ['pages/admin/users.html', '人', '用户']] : [['pages/clerk/dashboard.html', '售', '工作台']];
    document.querySelectorAll('.tab-bar').forEach(nav => {
      nav.replaceChildren();
      for (const [path, icon, title] of items) {
        const link = document.createElement('a'); link.href = api.page(path); link.className = 'tab-item';
        if (new URL(link.href).pathname === currentPath) { link.classList.add('is-active'); link.setAttribute('aria-current', 'page'); }
        const badge = document.createElement('span'); badge.className = 'nav-text-icon'; badge.textContent = icon;
        const label = document.createElement('span'); label.textContent = title; link.append(badge, label); nav.append(link);
      }
    });
  }
  global.Mini12306RoleGuard = {ready, home};
  document.addEventListener('DOMContentLoaded', guard);
})(window);
