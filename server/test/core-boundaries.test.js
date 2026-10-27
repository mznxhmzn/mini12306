/** 核心方法边界补测；编号与 TEST_REPORT.md 第 12 节逐条对应。 */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const valid = require('../src/utils/validation');
const {maskPhone, maskName, maskId, plain} = require('../src/utils/serialize');
const {Train} = require('../src/models');

test('V01 手机号长度、前缀和对象输入边界', () => {
  assert.equal(valid.phone('13800008001'), '13800008001');
  for (const value of ['1380008001', '138000008001', '23800008001', {$ne:null}]) {
    assert.throws(() => valid.phone(value), {status:400});
  }
});

test('V02 密码最小长度及 bcrypt 72 字节上限', () => {
  assert.throws(() => valid.password('12345'), {status:400});
  assert.equal(valid.password('123456'), '123456');
  assert.equal(valid.password('a'.repeat(72)), 'a'.repeat(72));
  assert.throws(() => valid.password('a'.repeat(73)), {status:400});
  // UTF-8 中一个汉字占三个字节，不能只检查字符数。
  assert.equal(valid.password('密'.repeat(24)), '密'.repeat(24));
  assert.throws(() => valid.password('密'.repeat(25)), {status:400});
});

test('V03 日期闰年、非法日期及非标准格式', () => {
  assert.equal(valid.date('2028-02-29'), '2028-02-29');
  for (const value of ['2026-02-29', '2026-02-30', '2026-2-01', '']) {
    assert.throws(() => valid.date(value), {status:400});
  }
});

test('V04 车次票价和余票的零值、上限及非法数值', () => {
  // 完整合法基础车次，避免其他必填字段干扰席别校验。
  const base = {
    trainNumber:'G66', trainType:'高速动车', departureStation:'武汉',
    arrivalStation:'北京南', departureCity:'武汉', arrivalCity:'北京',
    departureTime:'07:38', arrivalTime:'11:30', durationMinutes:232,
    operatingDates:['2028-02-29'], stops:['武汉', '北京南'], bookable:true
  };
  const input = (price, remaining) => ({...base, seats:[{seatType:'二等座', price, remaining}]});
  assert.deepEqual(valid.trainInput(input(0, 0)).seats, [{seatType:'二等座', price:0, remaining:0}]);
  assert.equal(valid.trainInput(input(100000, 1)).seats[0].price, 100000);
  for (const [price, remaining] of [[-0.01,1], [100000.01,1], [NaN,1], [1,-1], [1,1.5]]) {
    assert.throws(() => valid.trainInput(input(price, remaining)), {status:400});
  }
});

test('S02 姓名单字、双字和三字的脱敏分支', () => {
  assert.equal(maskName('张'), '*');
  assert.equal(maskName('张明'), '张*');
  assert.equal(maskName('张小明'), '张*明');
  assert.equal(maskName(''), '');
});

test('S03 证件号保留前六后四位及空值处理', () => {
  assert.equal(maskId('420106200001011234'), '420106********1234');
  assert.equal(maskId(''), '');
  assert.equal(maskId(undefined), '');
});

test('S04 plain 支持普通对象和真实 Mongoose 文档', () => {
  const source = {_id:'T-SERIALIZE', __v:2, trainNumber:'G66'};
  assert.deepEqual(plain(source), {id:'T-SERIALIZE', trainNumber:'G66'});
  assert.equal(source._id, 'T-SERIALIZE'); // 原对象未被修改。
  const result = plain(new Train({_id:'T-DOCUMENT', trainNumber:'G66'}));
  assert.equal(result.id, 'T-DOCUMENT');
  assert.equal(result.trainNumber, 'G66');
  assert.equal(Object.hasOwn(result, '_id'), false);
  assert.equal(Object.hasOwn(result, '__v'), false);
});

test('S05 手机号直接脱敏及空值处理', () => {
  assert.equal(maskPhone('13800008001'), '138****8001');
  assert.equal(maskPhone(''), '');
  assert.equal(maskPhone(undefined), '');
});
