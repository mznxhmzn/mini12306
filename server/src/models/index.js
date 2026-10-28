const mongoose = require('mongoose');
const { randomUUID } = require('node:crypto');
const { Schema } = mongoose;
// Mongoose 调用默认函数时会传入内部参数，包装后不把参数误传给 crypto。
const identity = { _id: { type: String, default: () => randomUUID() } };
const options = { timestamps: true, versionKey: false };
const userSchema = new Schema({ ...identity, account: {type: String, required: true, unique: true}, phone: {type: String, required: true, unique: true, match: /^1\d{10}$/}, passwordHash: {type: String, required: true, select: false}, role: {type: String, enum: ['passenger', 'clerk', 'admin'], default: 'passenger', index: true}, status: {type: String, enum: ['active', 'locked'], default: 'active'}, realName: {type: String, required: true}, idNumber: String, verified: {type: Boolean, default: false}, failedAttempts: {type: Number, default: 0}, lockedUntil: Date, lastActiveAt: Date }, options);
const seatSchema = new Schema({ seatType: {type: String, required: true}, price: {type: Number, required: true, min: 0}, remaining: {type: Number, required: true, min: 0} }, {_id: false});
// 角色变化提升版本，旧令牌即使角色恢复也不能重新有效。
userSchema.add({authVersion: {type: Number, default: 0}});
userSchema.add({passengerRevision: {type: Number, default: 0}});
// 每次登录分别计时，重新登录不会刷新旧会话。
const sessionSchema = new Schema({...identity, userId: {type: String, required: true, index: true}, authVersion: {type: Number, required: true}, lastActiveAt: {type: Date, required: true}, expiresAt: {type: Date, required: true}}, options);
sessionSchema.index({expiresAt: 1}, {expireAfterSeconds: 0});
const trainSchema = new Schema({ ...identity, trainNumber: {type: String, required: true, unique: true}, trainType: String, departureStation: String, arrivalStation: String, departureCity: String, arrivalCity: String, departureTime: String, arrivalTime: String, durationMinutes: Number, operatingDates: [String], stops: [String], seats: [seatSchema], bookable: {type: Boolean, default: true}, revision: {type: Number, default: 0} }, options);
// 车次查询有“城市/车站”四种起终点组合，各建一条复合索引避免全表扫描。
trainSchema.index({departureCity: 1, arrivalCity: 1, operatingDates: 1, bookable: 1});
trainSchema.index({departureCity: 1, arrivalStation: 1, operatingDates: 1, bookable: 1});
trainSchema.index({departureStation: 1, arrivalCity: 1, operatingDates: 1, bookable: 1});
trainSchema.index({departureStation: 1, arrivalStation: 1, operatingDates: 1, bookable: 1});
// 每天的库存独立，不能把不同乘车日的余票混用。
const inventorySchema = new Schema({ ...identity, trainId: {type: String, required: true}, date: {type: String, required: true}, seatType: {type: String, required: true}, remaining: {type: Number, min: 0, required: true} }, options);
inventorySchema.index({trainId: 1, date: 1, seatType: 1}, {unique: true});
const orderSchema = new Schema({ ...identity, orderNumber: {type: String, required: true, unique: true}, userId: {type: String, required: true}, passengerId: String, passengerNameMasked: String, trainId: {type: String, required: true}, trainNumber: String, departureCity: String, arrivalCity: String, departureStation: String, arrivalStation: String, departureDate: String, departureTime: String, arrivalTime: String, seatType: String, amount: {type: Number, min: 0}, status: {type: String, enum: ['pending', 'paid', 'cancelled', 'refunded', 'changed'], default: 'pending'}, expiresAt: Date, issuedBy: String, requestId: String, originalOrderId: String, newOrderId: String }, options);
orderSchema.index({userId: 1, status: 1});
orderSchema.add({carNumber:String,seatNumber:String});
// 历史取消单不猜测原因；新清理单据记录发生时间，供只读统计使用。
orderSchema.add({cancelReason:String,cancelledAt:Date});
orderSchema.add({passengerIdType:String,passengerIdNumberMasked:String});
orderSchema.index({trainId:1,departureDate:1,seatType:1,status:1});
// 过期清理先匹配状态，再按过期时间范围查找；保留原有用户订单索引。
orderSchema.index({status: 1, expiresAt: 1});
orderSchema.index({userId: 1, requestId: 1}, {unique: true, partialFilterExpression: {requestId: {$type: 'string'}}});
const passengerSchema = new Schema({...identity, ownerUserId: {type: String, required: true, index: true}, nameMasked: String, idType: String, idNumberMasked: String, passengerType: String}, options);
// 旧记录只保留原有脱敏资料，不补造明文。
passengerSchema.add({name: String, idNumber: String});
passengerSchema.index({ownerUserId:1,idType:1,idNumber:1}, {unique:true,partialFilterExpression:{idNumber:{$type:'string'}}});
const recordSchema = new Schema({...identity, orderId: {type: String, required: true, unique: true}, userId: String, amount: Number, method: String, status: String, reason: String}, options);
const User = mongoose.model('User', userSchema, 'users');
const Train = mongoose.model('Train', trainSchema, 'trains');
const Inventory = mongoose.model('Inventory', inventorySchema, 'inventories');
const Order = mongoose.model('Order', orderSchema, 'orders');
const Passenger = mongoose.model('Passenger', passengerSchema, 'passengers');
const PaymentRecord = mongoose.model('PaymentRecord', recordSchema, 'payment_records');
// 一张新票可以先退改签差额、之后再退票，两种事件分别保证幂等。
const refundSchema = new Schema({...identity, orderId: {type: String, required: true}, eventType: {type: String, enum: ['ticket_refund', 'reschedule_difference'], default: 'ticket_refund', required: true}, userId: String, amount: Number, method: String, status: String, reason: String}, options);
refundSchema.index({orderId: 1, eventType: 1}, {unique: true, name: 'refund_order_event_unique'});
refundSchema.add({feeAmount:Number,feeRate:Number});
const RefundRecord = mongoose.model('RefundRecord', refundSchema, 'refund_records');
const Session = mongoose.model('Session', sessionSchema, 'sessions');
module.exports = { User, Train, Inventory, Order, Passenger, PaymentRecord, RefundRecord, Session };
