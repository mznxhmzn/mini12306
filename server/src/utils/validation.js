const { assert } = require('./errors');
const roles = ['passenger', 'clerk', 'admin'];
function text(value, label, max = 100) { assert(typeof value === 'string' && value.trim().length > 0 && value.length <= max, 400, `${label}不正确`); return value.trim(); }
function phone(value) { assert(typeof value === 'string' && /^1\d{10}$/.test(value), 400, '手机号必须为以 1 开头的 11 位数字'); return value; }
function password(value) { assert(typeof value === 'string' && value.length >= 6 && Buffer.byteLength(value, 'utf8') <= 72, 400, '密码至少 6 位且不超过 72 字节'); return value; }
function date(value) { assert(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value, 400, '日期格式不正确'); return value; }
function validateCoreChange(oldTrain, changes, hasOrders) {
  if (hasOrders) for (const field of ['trainNumber', 'departureStation', 'arrivalStation']) {
    assert(changes[field] === undefined || changes[field] === oldTrain[field], 409, '已有订单关联，不能修改车次号、出发站或到达站');
  }
}
function trainInput(body, oldTrain = {}) {
  const result = {};
  for (const field of ['trainNumber', 'trainType', 'departureStation', 'arrivalStation', 'departureCity', 'arrivalCity']) result[field] = text(body[field] ?? oldTrain[field], field);
  assert(/^[A-Z]\d{1,6}$/.test(result.trainNumber), 400, '车次号格式不正确');
  assert(result.departureStation !== result.arrivalStation, 400, '出发站与到达站不能相同');
  for (const field of ['departureTime', 'arrivalTime']) { result[field] = body[field] ?? oldTrain[field]; assert(typeof result[field] === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(result[field]), 400, '时间格式不正确'); }
  result.durationMinutes = body.durationMinutes ?? oldTrain.durationMinutes;
  assert(Number.isInteger(result.durationMinutes) && result.durationMinutes > 0, 400, '历时必须为正整数分钟');
  result.bookable = body.bookable ?? oldTrain.bookable ?? true;
  assert(typeof result.bookable === 'boolean', 400, 'bookable 必须是布尔值');
  result.operatingDates = body.operatingDates ?? oldTrain.operatingDates;
  assert(Array.isArray(result.operatingDates) && result.operatingDates.length > 0 && result.operatingDates.length <= 366, 400, '请提供运营日期');
  result.operatingDates = [...new Set(result.operatingDates.map(date))];
  result.stops = body.stops ?? oldTrain.stops ?? [];
  assert(Array.isArray(result.stops) && result.stops.length <= 100, 400, '经停站格式不正确');
  result.stops = result.stops.map(value => text(value, '经停站'));
  result.seats = body.seats ?? oldTrain.seats;
  assert(Array.isArray(result.seats) && result.seats.length > 0 && result.seats.length <= 20, 400, '至少提供一种席别');
  result.seats = result.seats.map(seat => {
    const seatType = text(seat.seatType, '席别');
    assert(typeof seat.price === 'number' && Number.isFinite(seat.price) && seat.price >= 0 && seat.price <= 100000, 400, '票价不能为负且必须为有效数字');
    assert(Number.isInteger(seat.remaining) && seat.remaining >= 0, 400, '余票必须为非负整数');
    return { seatType, price: Math.round(seat.price * 100) / 100, remaining: seat.remaining };
  });
  assert(new Set(result.seats.map(s => s.seatType)).size === result.seats.length, 400, '席别不能重复');
  return result;
}
module.exports = { roles, text, phone, password, date, trainInput, validateCoreChange };
