const models = require('../models');
async function initializeModels() {
  await Promise.all(Object.values(models).map(model => model.init()));
  const collection = models.RefundRecord.collection;
  // 兼容旧退款：先补事件类型、建立新唯一约束，最后移除过强的旧约束。
  // 不清库、不删除流水，也不对其他集合执行 syncIndexes。
  await collection.updateMany({eventType: {$exists: false}}, [{$set: {eventType: {$cond: [{$eq: ['$method', '改签原路模拟退款']}, 'reschedule_difference', 'ticket_refund']}}}]);
  await collection.createIndex({orderId: 1, eventType: 1}, {unique: true, name: 'refund_order_event_unique'});
  const indexes = await collection.indexes();
  const legacy = indexes.find(index => index.unique && Object.keys(index.key).length === 1 && index.key.orderId === 1);
  if (legacy) {
    try { await collection.dropIndex(legacy.name); }
    catch (error) { if (error.code !== 27) throw error; } // 另一个启动实例已移除该索引时可继续。
  }
}
module.exports = { initializeModels };
