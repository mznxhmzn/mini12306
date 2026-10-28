const mongoose = require('mongoose');
const { Order, Passenger, PaymentRecord, RefundRecord, User } = require('../models');
const { plain, safePassenger } = require('../utils/serialize');
const { assert } = require('../utils/errors');
const valid = require('../utils/validation');
const service = require('../utils/order-service');
const {assignSeat}=require('../utils/seat-allocation');
const {refundQuote}=require('../utils/refund-policy');
async function quote(req,res){const order=await Order.findOne({_id:req.params.id,userId:req.user._id});assert(order,404,'订单不存在');assert(order.status==='paid',409,'只能预览已支付车票退款');res.json({quote:refundQuote(order)});}
const {orderQuery}=require('../utils/order-query');
async function paginated(req,res,userId){
  const {filter,page,limit}=orderQuery(req.query,userId);
  let query=Order.find(filter).sort({createdAt:-1,_id:-1}).skip((page-1)*limit).limit(limit);
  let count=Order.countDocuments(filter);
  if(userId){query=query.hint({userId:1,status:1});count=count.hint({userId:1,status:1});}
  const [orders,total]=await Promise.all([query,count]);
  res.json({orders:orders.map(plain),total,page,limit,hasMore:page*limit<total});
}
async function list(req,res){await service.expireOrders();await paginated(req,res,req.user._id);}
async function all(req,res){await paginated(req,res);}
async function detail(req, res) { const order = await Order.findOne({_id: req.params.id, userId: req.user._id}); assert(order, 404, '订单不存在'); res.json({order: plain(order)}); }
async function create(req, res) { res.status(201).json({order: plain(await service.createOrder(req.user, req.body))}); }
async function passengers(req, res) { res.json({passengers: (await Passenger.find({ownerUserId: req.user._id})).map(safePassenger)}); }
async function issue(req, res) {
  const user = await User.findOne({_id: valid.text(req.body.userId, '旅客编号'), role: 'passenger', status: 'active'});
  assert(user, 404, '旅客账号不存在或不可用');
  res.status(201).json({order: plain(await service.createOrder(user, req.body, req.user._id))});
}
async function pay(req, res) {
  let result, expired = false;
  await mongoose.connection.transaction(async session => {
    const order = await Order.findOne({_id: req.params.id, userId: req.user._id}).session(session);
    assert(order, 404, '订单不存在');
    if (order.status === 'paid') { result = order; return; }
    assert(order.status === 'pending', 409, '当前订单不能支付');
    if (order.expiresAt && order.expiresAt <= new Date()) {
      order.status = 'cancelled'; order.cancelReason='timeout';order.cancelledAt=new Date();await order.save({session}); await service.release(order, session); expired = true; return;
    }
    order.status = 'paid'; await assignSeat(order,session); await order.save({session});
    await PaymentRecord.create([{orderId: order._id, userId: req.user._id, amount: order.amount, method: valid.text(req.body.method || '模拟支付', '支付方式'), status: 'success'}], {session});
    result = order;
  });
  assert(!expired, 409, '支付超时，订单已取消且库存已释放');
  res.json({order: plain(result)});
}
async function refund(req, res) {
  let result;
  await mongoose.connection.transaction(async session => {
    const order = await Order.findOne({_id: req.params.id, userId: req.user._id}).session(session);
    assert(order, 404, '订单不存在');
    if (order.status === 'refunded') { result = order; return; }
    assert(order.status === 'paid', 409, '只能退已支付车票');
    const policy=refundQuote(order);
    order.status = 'refunded'; await order.save({session}); await service.release(order, session);
    await RefundRecord.create([{orderId: order._id, eventType: 'ticket_refund', userId: req.user._id, amount:policy.refundAmount, feeAmount:policy.feeAmount, feeRate:policy.feeRate, method: '原路模拟退款', status: 'success', reason: req.body.reason ? valid.text(req.body.reason, '退票原因') : '行程有变'}], {session});
    result = order;
  });
  res.json({order: plain(result)});
}
async function cancel(req, res) {
  let result;
  await mongoose.connection.transaction(async session => {
    result = await Order.findOne({_id: req.params.id, userId: req.user._id}).session(session);
    assert(result, 404, '订单不存在');
    if (result.status === 'cancelled') return;
    assert(result.status === 'pending', 409, '只能取消待支付订单');
    result.status = 'cancelled'; result.cancelReason='user';result.cancelledAt=new Date();await result.save({session}); await service.release(result, session);
  });
  res.json({order: plain(result)});
}
async function reschedule(req, res) {
  let replacement;
  await mongoose.connection.transaction(async session => {
    const old = await Order.findOne({_id: req.params.id, userId: req.user._id}).session(session);
    assert(old, 404, '订单不存在');
    assert(old.status!=='changed',409,'原订单已改签，请操作新订单','ALREADY_RESCHEDULED');
    assert(old.status === 'paid', 409, '只能改签已支付订单');
    assert(new Date(`${old.departureDate}T${old.departureTime}:00+08:00`) > new Date(), 409, '已发车，不能改签');
    // 使用原票脱敏快照，常用乘车人删除后仍能保留原旅客信息改签。
    replacement = await service.allocate(req.user, {...req.body, passengerId: undefined}, session, {status:'paid',originalOrderId:old._id,passengerId:old.passengerId,passengerNameMasked:old.passengerNameMasked,passengerIdType:old.passengerIdType,passengerIdNumberMasked:old.passengerIdNumberMasked});
    assert(old.trainId !== replacement.trainId || old.departureDate !== replacement.departureDate || old.seatType !== replacement.seatType, 400, '请选择不同的新行程');
    await assignSeat(replacement,session);await replacement.save({session});
    old.status = 'changed'; old.newOrderId = replacement._id; await old.save({session}); await service.release(old, session);
    if (replacement.amount > old.amount) await PaymentRecord.create([{orderId: replacement._id, userId: req.user._id, amount: Math.round((replacement.amount - old.amount) * 100) / 100, method: '改签模拟补款', status: 'success'}], {session});
    if (replacement.amount < old.amount) await RefundRecord.create([{orderId: replacement._id, eventType: 'reschedule_difference', userId: req.user._id, amount: Math.round((old.amount - replacement.amount) * 100) / 100, method: '改签原路模拟退款', status: 'success'}], {session});
  });
  res.json({order: plain(replacement)});
}
module.exports = {list, all, detail, create, passengers, issue, pay, refund, cancel, reschedule, quote};
