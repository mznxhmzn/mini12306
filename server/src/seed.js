const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { loadConfig } = require('./config');
const models = require('./models');
const { synchronizeInventory } = require('./controllers/admin');
async function seed() {
  await mongoose.connect(loadConfig().mongoUri);
  const context = {window: {}};
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../..', 'js/mock-data.js'), 'utf8'), context);
  const data = JSON.parse(JSON.stringify(context.window.Mini12306MockData));
  const passwordHash = await bcrypt.hash('123456', 10);
  await require('./utils/initialize-models').initializeModels();
  const withId = value => { const {id, ...rest} = value; return {_id: id, ...rest}; };
  // 重复运行只添加缺失的演示资料，不覆盖已有密码、订单或用户数据。
  for (const value of data.users) {
    const {phoneMasked, realNameMasked, idNumberMasked, ...user} = withId(value);
    await models.User.updateOne({_id: user._id}, {$setOnInsert: {...user, idNumber: idNumberMasked, passwordHash}}, {upsert: true});
  }
  for (const value of data.frequentPassengers) await models.Passenger.updateOne({_id: value.id}, {$setOnInsert: withId(value)}, {upsert: true});
  for (const value of data.trains) await mongoose.connection.transaction(async session => {
    if (await models.Train.exists({_id: value.id}).session(session)) return;
    const [train] = await models.Train.create([withId(value)], {session});
    await synchronizeInventory(train, session);
  });
  for (const value of data.orders) await mongoose.connection.transaction(async session => {
    if (await models.Order.exists({_id: value.id}).session(session)) return;
    const order = withId(value);
    // 为种子待支付订单生成新的支付有效期，并把已占用座位从当天库存扣除。
    if (order.status === 'pending') order.expiresAt = new Date(Date.now() + 15 * 60000);
    if (['pending', 'paid'].includes(order.status)) {
      const result = await models.Inventory.updateOne({trainId: order.trainId, date: order.departureDate, seatType: order.seatType, remaining: {$gte: 1}}, {$inc: {remaining: -1}}, {session});
      if (!result.modifiedCount) throw new Error('种子订单库存不足');
    }
    await models.Order.create([order], {session});
  });
  for (const [collection, values] of [[models.PaymentRecord, data.paymentRecords], [models.RefundRecord, data.refundRecords]]) for (const value of values) await collection.updateOne({_id: value.id}, {$setOnInsert: withId(value)}, {upsert: true});
  console.log('演示资料已导入，四个测试账号密码均为 123456');
}
seed().then(() => mongoose.disconnect()).catch(async error => { console.error(error.message); await mongoose.disconnect(); process.exitCode = 1; });
