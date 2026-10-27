const {test} = require('node:test');
const assert = require('node:assert/strict');
const {requireRole} = require('../src/middlewares/auth');
const {validateCoreChange, trainInput, phone, password, date} = require('../src/utils/validation');
const {safeUser} = require('../src/utils/serialize');
test('角色越权中间件返回 403', () => {
  let error;
  requireRole('admin')({user: {role:'passenger'}}, {}, value => { error = value; });
  assert.equal(error.status, 403);
});
test('有订单时禁止修改车次核心字段，允许相同值和票价修改', () => {
  const train = {trainNumber:'G66', departureStation:'武汉', arrivalStation:'北京南'};
  for (const field of Object.keys(train)) assert.throws(() => validateCoreChange(train, {[field]:'修改'}, true), {status:409});
  assert.doesNotThrow(() => validateCoreChange(train, {...train, seats:[]}, true));
  assert.doesNotThrow(() => validateCoreChange(train, {trainNumber:'G99'}, false));
});
test('手机号、密码和日期拒绝非法类型及格式', () => {
  assert.throws(() => phone({$ne:null}), {status:400});
  assert.throws(() => phone('23800008001'), {status:400});
  assert.throws(() => password('密'.repeat(30)), {status:400});
  assert.throws(() => date('2026-02-30'), {status:400});
  assert.equal(phone('13800008001'), '13800008001');
});
test('列表序列化只输出脱敏身份，无密码及完整手机号', () => {
  const result = safeUser({_id:'U1', realName:'张小明', phone:'13800008001', idNumber:'420106200001011234', passwordHash:'secret', role:'passenger'});
  assert.equal(result.phoneMasked,'138****8001'); assert.equal(result.realNameMasked,'张*明');
  assert.equal(result.phone,undefined); assert.equal(result.idNumber,undefined); assert.equal(result.passwordHash,undefined);
});
