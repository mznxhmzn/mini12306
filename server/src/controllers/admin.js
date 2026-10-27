const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { Train, Inventory, Order, User } = require('../models');
const { trainInput, validateCoreChange, roles, text, phone, password } = require('../utils/validation');
const { assert } = require('../utils/errors');
const { plain, safeUser } = require('../utils/serialize');
const { invalidateStationCache } = require('../utils/station-cache');
async function listTrains(req, res) { res.json({trains: (await Train.find().sort({trainNumber: 1})).map(plain)}); }
async function getTrain(req, res) { const train = await Train.findById(req.params.id); assert(train, 404, '车次不存在'); res.json({train: {...plain(train), coreLocked: Boolean(await Order.exists({trainId: train._id}))}}); }
async function createTrain(req, res) {
  let train;
  await mongoose.connection.transaction(async session => { [train] = await Train.create([trainInput(req.body)], {session}); await synchronizeInventory(train, session); });
  invalidateStationCache();
  res.status(201).json({train: plain(train)});
}
async function synchronizeInventory(train, session) {
  // 管理员填写的是各运营日可售余票绝对值，修改会明确覆盖每天的库存。
  for (const date of train.operatingDates) for (const seat of train.seats) {
    await Inventory.updateOne({trainId: train._id, date, seatType: seat.seatType}, {$set: {remaining: seat.remaining}}, {upsert: true, session});
  }
}
async function updateTrain(req, res) {
  let train;
  await mongoose.connection.transaction(async session => {
    train = await Train.findOneAndUpdate({_id: req.params.id}, {$inc: {revision: 1}}, {new: true, session});
    assert(train, 404, '车次不存在');
    const hasOrders = Boolean(await Order.exists({trainId: train._id}).session(session));
    validateCoreChange(train, req.body, hasOrders);
    if (hasOrders) {
      const allowed = new Set(['seats', 'operatingDates', 'bookable', 'trainNumber', 'departureStation', 'arrivalStation']);
      for (const key of Object.keys(req.body)) assert(allowed.has(key), 409, '已有订单时只能修改票价、余票、运营日期和售票状态');
      if (req.body.seats) for (const oldSeat of train.seats) assert(req.body.seats.some(s => s.seatType === oldSeat.seatType), 409, '已有订单时不能删除席别');
    }
    const next = trainInput(req.body, train.toObject());
    Object.assign(train, next); await train.save({session});
    // 仅编辑席别或增加运营日期时更新库存，停止售票不重置库存。
    if (req.body.seats) await synchronizeInventory(train, session);
    else for (const date of train.operatingDates) for (const seat of train.seats) await Inventory.updateOne({trainId: train._id, date, seatType: seat.seatType}, {$setOnInsert: {remaining: seat.remaining}}, {upsert: true, session});
  });
  invalidateStationCache();
  res.json({train: plain(train)});
}
async function deleteTrain(req, res) {
  await mongoose.connection.transaction(async session => {
    const train = await Train.findOneAndUpdate({_id: req.params.id}, {$inc: {revision: 1}}, {session});
    assert(train, 404, '车次不存在');
    assert(!await Order.exists({trainId: train._id}).session(session), 409, '有关联订单的车次不能删除，可停止售票');
    await Train.deleteOne({_id: train._id}, {session}); await Inventory.deleteMany({trainId: train._id}, {session});
  });
  invalidateStationCache();
  res.status(204).end();
}
async function listUsers(req, res) { res.json({users: (await User.find().sort({createdAt: -1})).map(safeUser)}); }
async function createUser(req, res) {
  assert(roles.includes(req.body.role), 400, '角色不正确');
  const user = await User.create({account: text(req.body.account, '账号'), phone: phone(req.body.phone), realName: text(req.body.realName, '姓名'), idNumber: req.body.idNumber ? text(req.body.idNumber, '证件号') : '', passwordHash: await bcrypt.hash(password(req.body.password), 10), role: req.body.role});
  res.status(201).json({user: safeUser(user)});
}
async function changeRole(req, res) {
  assert(roles.includes(req.body.role), 400, '角色不正确');
  assert(req.params.id !== req.user._id, 409, '不能修改自己的角色');
  const user = await User.findByIdAndUpdate(req.params.id, {$set: {role: req.body.role}, $inc: {authVersion: 1}}, {new: true, runValidators: true});
  assert(user, 404, '用户不存在'); res.json({user: safeUser(user)});
}
module.exports = {listTrains, getTrain, createTrain, updateTrain, deleteTrain, listUsers, createUser, changeRole, synchronizeInventory};
