/** 演示找回及改密；密码不写本地存储。 */
document.addEventListener('DOMContentLoaded',async()=>{
  const forgot=location.pathname.endsWith('/forgot-password.html');if(!forgot&&!await Mini12306RoleGuard.ready)return;
  const form=document.querySelector('#security-form');
  form.onsubmit=async event=>{
    event.preventDefault();const password=document.querySelector('#newPassword').value;
    if(password!==document.querySelector('#confirmPassword').value)return Mini12306Utils.showToast('两次新密码不一致');
    const button=form.querySelector('button');button.disabled=true;
    try{
      const body={newPassword:password};for(const field of (forgot?['account','phone','idNumber']:['oldPassword']))body[field]=document.getElementById(field).value;
      await Mini12306API.request('/auth/'+(forgot?'reset-password':'change-password'),{method:'POST',body});Mini12306Storage.clearSession();location.replace(Mini12306API.page('pages/login.html'));
    }catch(error){Mini12306Utils.showToast(error.message);}finally{button.disabled=false;}
  };
});
