const {assert}=require('./errors');
const HOUR=60*60*1000;
const rule='距发车超过8天免手续费；48小时至8天5%；24至不足48小时10%；不足24小时20%；发车后不可退票。';
function refundQuote(order,now=Date.now()){
  const departure=new Date(`${order.departureDate}T${order.departureTime}:00+08:00`).getTime();
  assert(Number.isFinite(departure),400,'车票发车时间无效');
  const remaining=departure-Number(now);
  assert(remaining>0,409,'已发车，不能退票','REFUND_DEPARTED');
  const feeRate=remaining>8*24*HOUR?0:remaining>=48*HOUR?0.05:remaining>=24*HOUR?0.1:0.2;
  const cents=Math.max(0,Math.round(order.amount*100));
  const feeCents=Math.round(cents*feeRate);
  return {amount:cents/100,feeRate,feeAmount:feeCents/100,refundAmount:(cents-feeCents)/100,rule};
}
module.exports={refundQuote};
