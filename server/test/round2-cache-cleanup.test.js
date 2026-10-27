/** 第二轮优化：只验证查询次数、缓存语义与清理合并，不产生性能数字。 */
const {test, beforeEach, afterEach} = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const {Train, Order, Inventory} = require('../src/models');
const {getStations, invalidateStationCache, STATION_CACHE_TTL_MS} = require('../src/utils/station-cache');
const {expireOrders} = require('../src/utils/order-service');

beforeEach(() => invalidateStationCache());
afterEach(() => invalidateStationCache());

const train = {departureCity:'武汉', arrivalCity:'北京', departureStation:'武汉', arrivalStation:'北京南'};
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
}
function mockStations(t, load) {
  return t.mock.method(Train, 'find', () => ({
    select(fields) {
      assert.equal(fields, 'departureCity arrivalCity departureStation arrivalStation');
      return {lean: load};
    }
  }));
}

test('站点缓存：首次查询、后续命中、去重及响应副本', async t => {
  const find = mockStations(t, async () => [train]);
  const first = await getStations();
  assert.deepEqual(first, ['武汉','北京','北京南']);
  first.push('不应污染缓存');
  assert.deepEqual(await getStations(), ['武汉','北京','北京南']);
  assert.equal(find.mock.callCount(), 1);
});

test('站点缓存：TTL 为五分钟，到期前命中、到期时重新查询', async t => {
  assert.equal(STATION_CACHE_TTL_MS, 300000);
  let now = 1000;
  t.mock.method(Date, 'now', () => now);
  const find = mockStations(t, async () => [train]);
  await getStations();
  now += STATION_CACHE_TTL_MS - 1;
  await getStations();
  assert.equal(find.mock.callCount(), 1);
  now += 1;
  await getStations();
  assert.equal(find.mock.callCount(), 2);
});

test('站点缓存：显式失效后立即重新读取数据库', async t => {
  const find = mockStations(t, async () => [train]);
  await getStations();
  invalidateStationCache();
  await getStations();
  assert.equal(find.mock.callCount(), 2);
});

test('站点缓存：冷缓存并发请求共享一次读取', async t => {
  const pending = deferred();
  const find = mockStations(t, () => pending.promise);
  const requests = Array.from({length: 10}, () => getStations());
  pending.resolve([train]);
  const results = await Promise.all(requests);
  assert.equal(find.mock.callCount(), 1);
  results.forEach(stations => assert.deepEqual(stations, ['武汉','北京','北京南']));
});

test('站点缓存：失效前的在途查询不能覆盖失效后加载的新数据', async t => {
  const oldQuery = deferred(), newQuery = deferred();
  const queue = [oldQuery, newQuery];
  const find = mockStations(t, () => queue.shift().promise);
  const oldRequest = getStations();
  await Promise.resolve();
  invalidateStationCache();
  const newRequest = getStations();
  await Promise.resolve();
  newQuery.resolve([{...train, arrivalCity:'上海', arrivalStation:'上海虹桥'}]);
  const fresh = await newRequest;
  oldQuery.resolve([train]);
  await oldRequest;
  assert.deepEqual(fresh, ['武汉','上海','上海虹桥']);
  assert.deepEqual(await getStations(), fresh);
  assert.equal(find.mock.callCount(), 2);
});

test('站点缓存：数据库失败向上抛出，失败不缓存并可重试', async t => {
  let fail = true;
  const find = mockStations(t, async () => { if (fail) throw new Error('test database failure'); return [train]; });
  await assert.rejects(getStations(), /test database failure/);
  fail = false;
  assert.deepEqual(await getStations(), ['武汉','北京','北京南']);
  assert.equal(find.mock.callCount(), 2);
});

test('站点缓存：空站点列表也是有效缓存', async t => {
  const find = mockStations(t, async () => []);
  assert.deepEqual(await getStations(), []);
  assert.deepEqual(await getStations(), []);
  assert.equal(find.mock.callCount(), 1);
});

test('过期清理：并发调用共享一次扫描及事务，完成后允许新一轮', async t => {
  const pending = deferred();
  let scans = 0;
  const find = t.mock.method(Order, 'find', filter => {
    assert.equal(filter.status, 'pending');
    assert.ok(filter.expiresAt.$lte instanceof Date);
    scans += 1;
    return {select(fields) { assert.equal(fields, '_id'); return scans === 1 ? pending.promise : Promise.resolve([]); }};
  });
  const transaction = t.mock.method(mongoose.connection, 'transaction', async work => work({testSession: true}));
  const update = t.mock.method(Order, 'findOneAndUpdate', async (filter, change, options) => {
    assert.equal(filter.status, 'pending');
    assert.equal(change.$set.status, 'cancelled');
    assert.deepEqual(options.session, {testSession: true});
    return {_id:'expired-1', trainId:'T1', departureDate:'2028-02-29', seatType:'二等座'};
  });
  const release = t.mock.method(Inventory, 'updateOne', async (filter, change, options) => {
    assert.deepEqual(change, {$inc:{remaining:1}});
    assert.deepEqual(options.session, {testSession: true});
  });
  const flights = Array.from({length: 10}, () => expireOrders());
  pending.resolve([{_id:'expired-1'}]);
  await Promise.all(flights);
  assert.ok(flights.every(flight => flight === flights[0]));
  assert.equal(find.mock.callCount(), 1);
  assert.equal(transaction.mock.callCount(), 1);
  assert.equal(update.mock.callCount(), 1);
  assert.equal(release.mock.callCount(), 1);
  await expireOrders();
  assert.equal(find.mock.callCount(), 2);
});

test('过期清理：失败传播给所有等待者，保护释放后可再次执行', async t => {
  let fail = true;
  const find = t.mock.method(Order, 'find', () => ({select: () => fail ? Promise.reject(new Error('cleanup failed')) : Promise.resolve([])}));
  const results = await Promise.allSettled([expireOrders(), expireOrders()]);
  assert.ok(results.every(result => result.status === 'rejected' && result.reason.message === 'cleanup failed'));
  assert.equal(find.mock.callCount(), 1);
  fail = false;
  await expireOrders();
  assert.equal(find.mock.callCount(), 2);
});
