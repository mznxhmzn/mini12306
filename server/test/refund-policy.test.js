const {test}=require('node:test');const assert=require('node:assert/strict');
const {refundQuote}=require('../src/utils/refund-policy');
const order={departureDate:'2028-12-31',departureTime:'12:00',amount:100};
const departure=Date.parse('2028-12-31T12:00:00+08:00'),hour=3600000;
for(const [label,remaining,rate] of [['超过8天',192*hour+1,0],['恰好8天',192*hour,0.05],['恰好48小时',48*hour,0.05],['不足48小时',48*hour-1,0.1],['恰好24小时',24*hour,0.1],['不足24小时',24*hour-1,0.2]])test('阶段4：'+label,()=>{const q=refundQuote(order,departure-remaining);assert.equal(q.feeRate,rate);assert.equal(q.feeAmount,100*rate);assert.equal(q.refundAmount,100-100*rate);});
test('阶段4：发车及之后拒绝，零票价最低零元，分币舍入',()=>{
  for(const now of [departure,departure+1])assert.throws(()=>refundQuote(order,now),{businessCode:'REFUND_DEPARTED'});
  assert.equal(refundQuote({...order,amount:0},departure-hour).refundAmount,0);
  assert.equal(refundQuote({...order,amount:520.5},departure-72*hour).feeAmount,26.03);
});
