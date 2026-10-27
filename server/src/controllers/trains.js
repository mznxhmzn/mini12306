const { Train, Inventory } = require('../models');
const { plain } = require('../utils/serialize');
const valid = require('../utils/validation');
const { assert } = require('../utils/errors');
const { getStations } = require('../utils/station-cache');
async function list(req, res) {
  const date = valid.date(req.query.date);
  const from = valid.text(req.query.from, '出发地');
  const to = valid.text(req.query.to, '目的地');
  assert(from !== to, 400, '出发地与目的地不能相同');
  // 拆成四种起终点组合，每种都能单独命中一条复合索引。
  const routes = [
    {departureCity: from, arrivalCity: to},
    {departureCity: from, arrivalStation: to},
    {departureStation: from, arrivalCity: to},
    {departureStation: from, arrivalStation: to}
  ].map(route => ({...route, operatingDates: date, bookable: true}));
  const trains = await Train.find({$or: routes}).lean();
  const inventory = await Inventory.find({trainId: {$in: trains.map(t => t._id)}, date}).lean();
  // 先按“车次+席别”建索引表，把逐个查找的 O(n×m) 降为 O(n+m)。
  const remaining = new Map(inventory.map(i => [`${i.trainId}|${i.seatType}`, i.remaining]));
  res.json({trains: trains.map(train => ({...plain(train), seats: train.seats.map(seat => ({...seat, remaining: remaining.get(`${train._id}|${seat.seatType}`) ?? 0}))}))});
}
async function stations(req, res) {
  res.json({stations: await getStations()});
}
module.exports = { list, stations };
