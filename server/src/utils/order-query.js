const {text}=require('./validation');
const {assert}=require('./errors');
const statuses=['pending','paid','cancelled','refunded','changed'];
function orderQuery(query,userId){
  const filter=userId?{userId}:{};
  if(query.status!==undefined){const values=text(query.status,'订单状态').split(',');assert(values.every(s=>statuses.includes(s)),400,'订单状态不正确');filter.status={$in:[...new Set(values)]};}
  function integer(value,fallback,label){if(value===undefined)return fallback;assert(typeof value==='string'&&/^\d+$/.test(value)&&Number.isSafeInteger(Number(value))&&Number(value)>0,400,label+'必须为正整数');return Number(value);}
  const page=integer(query.page,1,'页码'),limit=Math.min(integer(query.limit,20,'每页条数'),100);
  assert(Number.isSafeInteger((page-1)*limit),400,'页码过大');
  if(query.keyword!==undefined){const keyword=text(query.keyword,'关键词',80);const escaped=keyword.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');filter.$or=[{orderNumber:{$regex:escaped,$options:'i'}},{trainNumber:{$regex:escaped,$options:'i'}}];}
  return {filter,page,limit};
}
module.exports={orderQuery};
