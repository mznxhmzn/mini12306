/** 注册仅创建旅客，演示验证码不表示真实短信认证。 */
document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('form');
  form.removeAttribute('action');
  form.removeAttribute('method');
  const code = document.querySelector('#register-code');
  document.querySelector('.secondary-button').onclick = () => { code.value = '123456'; Mini12306Utils.showToast('演示验证码：123456，不发送真实短信'); };
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (document.querySelector('#register-password').value !== document.querySelector('#register-confirm-password').value) return Mini12306Utils.showToast('两次密码不一致');
    if (!form.querySelector('input[type="checkbox"]').checked) return Mini12306Utils.showToast('请同意服务协议');
    const button = form.querySelector('[type="submit"]'); button.disabled = true;
    try {
      await Mini12306API.request('/auth/register', {method: 'POST', body: {phone: document.querySelector('#register-phone').value.trim(), password: document.querySelector('#register-password').value, realName: document.querySelector('#register-name').value.trim(), idNumber: document.querySelector('#register-id-number').value.trim()}});
      location.href = Mini12306API.page('pages/login.html');
    } catch (error) { Mini12306Utils.showToast(error.message); }
    finally { button.disabled = false; }
  });
});
