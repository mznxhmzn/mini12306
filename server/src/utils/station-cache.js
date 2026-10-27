const { Train } = require('../models');

const STATION_CACHE_TTL_MS = 5 * 60 * 1000;
let cachedStations = null;
let expiresAt = 0;
let generation = 0;
let inFlight = null;

// 单进程缓存，仅保存公共站点。多实例各有一份，必要时需改为共享缓存。
function invalidateStationCache() {
  generation += 1;
  cachedStations = null;
  expiresAt = 0;
  inFlight = null;
}

function getStations() {
  if (cachedStations !== null && Date.now() < expiresAt) {
    return Promise.resolve([...cachedStations]);
  }
  // 冷缓存的并发请求也共享一次数据库读取。
  if (inFlight) return inFlight.promise.then(stations => [...stations]);

  const startedGeneration = generation;
  const flight = {};
  flight.promise = Promise.resolve().then(async () => {
    const trains = await Train.find().select('departureCity arrivalCity departureStation arrivalStation').lean();
    const stations = [...new Set(trains.flatMap(train => [train.departureCity, train.arrivalCity, train.departureStation, train.arrivalStation]))].filter(Boolean);
    // 写入成功后失效过的旧查询不能再次填入缓存。
    if (generation === startedGeneration) {
      cachedStations = stations;
      expiresAt = Date.now() + STATION_CACHE_TTL_MS;
    }
    return stations;
  }).finally(() => {
    if (inFlight === flight) inFlight = null;
  });
  inFlight = flight;
  // 返回副本，避免调用方修改公共缓存；查询失败直接向上抛出，不缓存错误。
  return flight.promise.then(stations => [...stations]);
}

module.exports = { getStations, invalidateStationCache, STATION_CACHE_TTL_MS };
