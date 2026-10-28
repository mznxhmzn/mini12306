/** 只读统计，日期为北京时间；用 DOM 和 CSS 绘图，不依赖图表库。 */
document.addEventListener('DOMContentLoaded',async()=>{
  if(!await Mini12306RoleGuard.ready)return;
  const date=document.querySelector('#stats-date'),cards=document.querySelector('#stats-cards'),message=document.querySelector('#stats-message');
  date.value=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'});
  const node=(tag,text,className)=>{const item=document.createElement(tag);item.textContent=text;if(className)item.className=className;return item;};
  function bars(id,items,label){
    const container=document.getElementById(id);container.replaceChildren();
    if(!items.length){container.textContent='当日暂无有效已支付车票';return;}
    const maximum=Math.max(...items.map(item=>item.count),1);
    for(const item of items){
      const row=node('div','','stats-bar-row'),heading=node('div',item[label]+' · '+item.count+' 张');
      const track=node('div','','stats-track'),bar=node('div','','stats-bar');bar.style.width=(item.count/maximum*100)+'%';
      track.append(bar);row.append(heading,track);container.append(row);
    }
  }
  let generation=0;
  async function load(){
    const current=++generation;message.textContent='正在加载统计…';cards.replaceChildren();
    document.querySelector('#top-trains').replaceChildren();document.querySelector('#top-routes').replaceChildren();
    try{
      const result=await Mini12306API.request('/admin/stats?'+new URLSearchParams({date:date.value}));
      if(current!==generation)return;
      const money=Mini12306Utils.formatCurrency;
      const values=[['订单总数',result.totalOrders],['支付流水',money(result.paidAmount)],['退款流水',money(result.refundAmount)],['收支差额',money(result.netAmount)],['超时清理',result.expiredCleanupCount]];
      for(const [status,label] of Object.entries({pending:'待支付',paid:'已支付',cancelled:'已取消',refunded:'已退票',changed:'已改签'}))values.push([label,result.statusCounts[status]]);
      for(const [label,value] of values){const card=node('div','','stats-card');card.append(node('span',label),node('strong',String(value)));cards.append(card);}
      bars('top-trains',result.topTrains,'trainNumber');bars('top-routes',result.topRoutes,'route');message.textContent='统计日：'+result.date+'（北京时间）';
    }catch(error){if(current===generation)message.textContent='加载失败：'+error.message+'，请点击刷新重试。';}
  }
  document.querySelector('#stats-refresh').onclick=load;date.onchange=load;await load();
});
