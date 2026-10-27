const mongoose = require('mongoose');
const { randomUUID } = require('node:crypto');
const { Train, Order, Inventory, Passenger, PaymentRecord, RefundRecord } = require('../models');
const { assert } = require('./errors');
const valid = require('./validation');
const { maskName } = require('./serialize');
async function allocate(user, body, session, extra = {}) {
  const departureDate = valid.date(body.departureDate);
  assert(departureDate >= new Date().toLocaleDateString('en-CA', {timeZone: 'Asia/Shanghai'}), 400, '不能购买过去日期的车票');
  const trainId = valid.text(body.trainId, '车次编号');
  const seatType = valid.text(body.seatType, '席别');
  // 与管理员修改共用车次文档写锁，避免关联订单与改车次同时发生。
  const train = await Train.findOneAndUpdate({_id: trainId, bookable: true, operatingDates: departureDate}, {$inc: {revision: 1}}, {new: true, session});
  assert(train, 404, '车次不存在、停止售票或当日不运营');
  assert(new Date(`${departureDate}T${train.departureTime}:00+08:00`) > new Date(), 409, '该车次已经发车');
  const seat = train.seats.find(s => s.seatType === seatType);
  assert(seat, 400, '席别不存在');
  const updated = await Inventory.findOneAndUpdate({trainId, date: departureDate, seatType, remaining: {$gte: 1}}, {$inc: {remaining: -1}}, {new: true, session});
  assert(updated, 409, '余票不足');
  let passenger;
  if (body.passengerId) {
    passenger = await Passenger.findOne({_id: valid.text(body.passengerId, '乘车人编号'), ownerUserId: user._id}).session(session);
    assert(passenger, 403, '不能使用他人的乘车人资料');
  }
  const [order] = await Order.create([{orderNumber: `E${Date.now()}${randomUUID().slice(0, 8)}`, userId: user._id, passengerId: passenger?._id, passengerNameMasked: passenger?.nameMasked || maskName(user.realName), trainId, trainNumber: train.trainNumber, departureCity: train.departureCity, arrivalCity: train.arrivalCity, departureStation: train.departureStation, arrivalStation: train.arrivalStation, departureDate, departureTime: train.departureTime, arrivalTime: train.arrivalTime, seatType, amount: seat.price, expiresAt: new Date(Date.now() + 15 * 60000), ...extra}], {session});
  return order;
}
async function release(order, session) {
  await Inventory.updateOne({trainId: order.trainId, date: order.departureDate, seatType: order.seatType}, {$inc: {remaining: 1}}, {session});
}
async function createOrder(user, body, issuedBy) {
  const requestId = valid.text(body.requestId, '请求编号', 100);
  let result;
  try {
    await mongoose.connection.transaction(async session => {
      result = await Order.findOne({userId: user._id, requestId}).session(session);
      if (result) return;
      result = await allocate(user, body, session, {requestId, issuedBy, status: issuedBy ? 'paid' : 'pending'});
      if (issuedBy) await PaymentRecord.create([{orderId: result._id, userId: user._id, amount: result.amount, method: '柜台模拟出票', status: 'success'}], {session});
    });
  } catch (error) {
    // 同一个请求并发重试返回原订单，既不重复扣票也不返回无关订单。
    if (error.code !== 11000) throw error;
    result = await Order.findOne({userId: user._id, requestId});
    if (!result) throw error;
  }
  return result;
}
let expirationFlight = null;
// 单进程内，订单列表请求和定时器共享正在执行的清理；失败后也允许下一轮重试。
function expireOrders() {
  if (!expirationFlight) {
    expirationFlight = runExpiration().finally(() => { expirationFlight = null; });
  }
  return expirationFlight;
}
async function runExpiration() {
  const expired = await Order.find({status: 'pending', expiresAt: {$lte: new Date()}}).select('_id');
  for (const old of expired) await mongoose.connection.transaction(async session => {
    const order = await Order.findOneAndUpdate({_id: old._id, status: 'pending', expiresAt: {$lte: new Date()}}, {$set: {status: 'cancelled'}}, {new: true, session});
    if (order) await release(order, session);
  });
}
module.exports = { allocate, release, createOrder, expireOrders };
