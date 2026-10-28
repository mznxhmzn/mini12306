/** 乘车人仅展示脱敏信息，编辑时留空保留原值。 */
document.addEventListener('DOMContentLoaded',async()=>{
  if(!await Mini12306RoleGuard.ready) return;
  const api=Mini12306API, list=document.querySelector('#passenger-list'), form=document.querySelector('#passenger-form');
  const name=document.querySelector('#passenger-name'), id=document.querySelector('#passenger-id'), type=document.querySelector('#passenger-id-type');
  let editing=null;
  function reset(){editing=null;form.reset();name.required=id.required=true;name.placeholder=id.placeholder='';document.querySelector('#passenger-editor-title').textContent='新增乘车人';}
  document.querySelector('#cancel-passenger-edit').onclick=reset;
  async function render(){
    list.textContent='正在加载…';
    try {
      const {passengers}=await api.request('/passengers'); list.replaceChildren();
      if(!passengers.length) list.textContent='暂无乘车人，请在下方添加。';
      for(const p of passengers){
        const card=document.createElement('section');card.className='section-card';
        const text=document.createElement('p');text.textContent=`${p.nameMasked||'未命名'} · ${p.idType||'证件'} ${p.idNumberMasked||'未提供'}`;
        const edit=document.createElement('button');edit.className='small-button';edit.textContent='编辑';
        edit.onclick=()=>{reset();editing=p.id;type.value=p.idType||'居民身份证';name.required=id.required=false;name.placeholder=id.placeholder='留空保留原值';document.querySelector('#passenger-editor-title').textContent='编辑乘车人';name.focus();};
        const remove=document.createElement('button');remove.className='small-button';remove.textContent='删除';remove.onclick=async()=>{if(!confirm('删除该乘车人？历史订单保留。'))return;remove.disabled=true;try{await api.request('/passengers/'+encodeURIComponent(p.id),{method:'DELETE'});reset();await render();}catch(e){Mini12306Utils.showToast(e.message);remove.disabled=false;}};
        card.append(text,edit,remove);list.append(card);
      }
    }catch(e){list.textContent=e.message;}
  }
  form.onsubmit=async event=>{event.preventDefault();const button=form.querySelector('[type="submit"]');button.disabled=true;try{const body={idType:type.value};if(name.value.trim())body.name=name.value.trim();if(id.value.trim())body.idNumber=id.value.trim();await api.request('/passengers'+(editing?'/'+encodeURIComponent(editing):''),{method:editing?'PUT':'POST',body});reset();await render();}catch(e){Mini12306Utils.showToast(e.message);}finally{button.disabled=false;}};
  await render();
});
