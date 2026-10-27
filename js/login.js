/** 密码验证与登录锁定在服务器执行。 */
document.addEventListener('DOMContentLoaded',()=>{
  const form=document.querySelector('#login-form'), phone=document.querySelector('#phone'), password=document.querySelector('#password'), button=document.querySelector('#login-button');
  document.querySelector('#password-toggle').onclick=()=>{
    password.type=password.type==='password'?'text':'password';
    document.querySelector('#password-toggle').setAttribute('aria-label',password.type==='password'?'显示密码':'隐藏密码');
  };
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(!/^1\d{10}$/.test(phone.value.trim())) return Mini12306Utils.showToast('请输入以 1 开头的 11 位手机号');
    if(!password.value) return Mini12306Utils.showToast('请输入密码');
    button.disabled=true; button.textContent='登录中…';
    try {
      const result=await Mini12306API.request('/auth/login',{method:'POST',body:{phone:phone.value.trim(),password:password.value}});
      Mini12306API.saveSession(result);
      location.replace(Mini12306API.page(Mini12306RoleGuard.home(result.user.role)));
    } catch(error) { Mini12306Utils.showToast(error.message); }
    finally { button.disabled=false; button.textContent='登录'; }
  });
});
