/** 当前旅客资料和统计从 API 读取。 */
document.addEventListener('DOMContentLoaded',async()=>{
  const user=await Mini12306RoleGuard.ready;
  if(!user) return;
  const set=(id,value)=>{ const element=document.getElementById(id); if(element) element.textContent=value; };
  set('profile-name',user.realNameMasked); set('profile-phone',(user.verified?'已实名认证':'未实名认证')+'　'+user.phoneMasked); set('profile-avatar',(user.realNameMasked||user.account).charAt(0));
  try {
    const [{orders},{passengers}]=await Promise.all([Mini12306API.request('/orders'),Mini12306API.request('/passengers')]);
    set('profile-order-count',orders.length); set('profile-upcoming-count',orders.filter(o=>['pending','paid'].includes(o.status)).length); set('profile-passenger-count',passengers.length); set('profile-payment-method','模拟支付');
  } catch(error) { Mini12306Utils.showToast(error.message); }
});
