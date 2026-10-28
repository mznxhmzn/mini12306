const {createHash}=require('node:crypto');
const {Train,Order}=require('../models');
const {assert}=require('./errors');
async function assignSeat(order,session){
  if(order.carNumber && order.seatNumber)return;
  // 所有出票路径共用车次写锁，避免两个事务同时认领同一座位。
  await Train.updateOne({_id:order.trainId},{$inc:{revision:1}},{session});
  const paid=await Order.find({_id:{$ne:order._id},trainId:order.trainId,departureDate:order.departureDate,seatType:order.seatType,status:'paid'}).select('carNumber seatNumber').session(session).lean();
  const occupied=new Set(paid.map(o=>`${o.carNumber}|${o.seatNumber}`));
  const start=createHash('sha256').update(`${order._id}|${order.seatType}`).digest().readUInt32BE(0)%10000;
  for(let offset=0;offset<10000;offset++){
    const index=(start+offset)%10000;
    const car=String(Math.floor(index/100)+1).padStart(2,'0'), seat=String(index%100+1).padStart(2,'0');
    if(!occupied.has(`${car}|${seat}`)){order.carNumber=car;order.seatNumber=seat;return;}
  }
  assert(false,409,'暂无可分配座位','SEAT_UNAVAILABLE');
}
module.exports={assignSeat};
