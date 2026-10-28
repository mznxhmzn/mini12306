const {Order,PaymentRecord,RefundRecord}=require('../models');
const {date:validateDate}=require('../utils/validation');
// 统计日按北京时间；支付/退款按流水发生日，销量按当日创建且当前有效的已支付票。
async function stats(req,res){
  const date=validateDate(req.query.date??new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'}));
  const start=new Date(date+'T00:00:00+08:00'),end=new Date(start.getTime()+86400000);
  const range={$gte:start,$lt:end};
  const [groups,payments,refunds,expired]=await Promise.all([
    Order.aggregate([{$match:{createdAt:range}},{$facet:{
      statuses:[{$group:{_id:'$status',count:{$sum:1}}}],
      topTrains:[{$match:{status:'paid'}},{$group:{_id:'$trainNumber',count:{$sum:1}}},{$sort:{count:-1,_id:1}},{$limit:5}],
      topRoutes:[{$match:{status:'paid'}},{$group:{_id:{from:'$departureCity',to:'$arrivalCity'},count:{$sum:1}}},{$sort:{count:-1,'_id.from':1,'_id.to':1}},{$limit:5}]
    }}]),
    PaymentRecord.aggregate([{$match:{createdAt:range,status:'success'}},{$group:{_id:null,amount:{$sum:'$amount'}}}]),
    RefundRecord.aggregate([{$match:{createdAt:range,status:'success'}},{$group:{_id:null,amount:{$sum:'$amount'}}}]),
    Order.aggregate([{$match:{status:'cancelled',cancelReason:'timeout',cancelledAt:range}},{$count:'count'}])
  ]);
  const result=groups[0],statusCounts={pending:0,paid:0,cancelled:0,refunded:0,changed:0};
  for(const item of result.statuses)statusCounts[item._id]=item.count;
  const money=value=>Math.round((value??0)*100)/100;
  const paidAmount=money(payments[0]?.amount),refundAmount=money(refunds[0]?.amount);
  res.json({date,totalOrders:Object.values(statusCounts).reduce((sum,n)=>sum+n,0),statusCounts,paidAmount,refundAmount,netAmount:money(paidAmount-refundAmount),
    topTrains:result.topTrains.map(item=>({trainNumber:item._id??'未知车次',count:item.count})),
    topRoutes:result.topRoutes.map(item=>({route:(item._id.from??'未知')+' → '+(item._id.to??'未知'),count:item.count})),
    expiredCleanupCount:expired[0]?.count??0});
}
module.exports={stats};
