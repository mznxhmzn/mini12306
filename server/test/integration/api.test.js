const {test, before, after, beforeEach} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const {MongoMemoryReplSet} = require('mongodb-memory-server');
const {createApp} = require('../../src/app');
const models = require('../../src/models');
const {expireOrders} = require('../../src/utils/order-service');
const jwt = require('jsonwebtoken');
const {initializeModels} = require('../../src/utils/initialize-models');
const {invalidateStationCache} = require('../../src/utils/station-cache');
let replica, server, base, hash;
const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0,10);
const afterTomorrow = new Date(Date.now() + 2 * 86400000).toISOString().slice(0,10);
const trainData = {_id:'T1', trainNumber:'G66', trainType:'高速动车', departureCity:'武汉', arrivalCity:'北京', departureStation:'武汉', arrivalStation:'北京南', departureTime:'07:38', arrivalTime:'11:30', durationMinutes:232, bookable:true, operatingDates:[tomorrow,afterTomorrow], stops:['武汉','北京南'], seats:[{seatType:'二等座', price:520.5, remaining:2}]};
before(async () => {
  // 使用独立、真实的 Mongo 单节点副本集，不接触开发数据库。
  replica = await MongoMemoryReplSet.create({binary:{version:'7.0.14', downloadDir:path.resolve(__dirname,'../../..','.cache/mongodb')}, replSet:{count:1, storageEngine:'wiredTiger'}});
  await mongoose.connect(replica.getUri('mini12306_test'));
  await initializeModels();
  hash = await bcrypt.hash('123456',10);
  server = createApp({jwtSecret:'test-secret-that-is-at-least-32-characters', jwtExpiresIn:'8h', origins:['http://localhost:5500']}).listen(0,'127.0.0.1');
  await new Promise(resolve => server.once('listening',resolve)); base = 'http://127.0.0.1:' + server.address().port;
}, {timeout:300000});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await mongoose.disconnect(); if (replica) await replica.stop(); });
beforeEach(async () => {
  invalidateStationCache();
  await Promise.all(Object.values(models).map(model => model.deleteMany({})));
  await models.User.create([
    {_id:'U1', account:'p1', phone:'13800008001', passwordHash:hash, role:'passenger', realName:'张小明', idNumber:'420106200001011234'},
    {_id:'U2', account:'p2', phone:'13800008004', passwordHash:hash, role:'passenger', realName:'陈小雨'},
    {_id:'A1', account:'admin', phone:'13800008003', passwordHash:hash, role:'admin', realName:'王小安'},
    {_id:'C1', account:'clerk', phone:'13800008002', passwordHash:hash, role:'clerk', realName:'李小华'}
  ]);
  await models.Train.create(trainData);
  await models.Inventory.create([tomorrow,afterTomorrow].map(date => ({trainId:'T1', date, seatType:'二等座', remaining:2})));
});
async function request(route, method='GET', body, token, headers={}) {
  const response = await fetch(base + '/api' + route,{method, headers:{'Content-Type':'application/json', ...(token?{Authorization:'Bearer '+token}:{}), ...headers}, body:body ? JSON.stringify(body) : undefined});
  return {status:response.status, data:response.status === 204 ? {} : await response.json()};
}
async function login(phone='13800008001') { const result = await request('/auth/login','POST',{phone,password:'123456'}); assert.equal(result.status,200); return result.data.token; }
const booking = (requestId='request1', departureDate=tomorrow) => ({trainId:'T1', departureDate, seatType:'二等座', requestId});
// 只推进临时数据库中的指定会话时间，不影响其他登录设备。
async function expireSession(token) {
  const payload = jwt.decode(token);
  assert.ok(payload.jti);
  await models.Session.updateOne({_id:payload.jti}, {$set:{lastActiveAt:new Date(Date.now()-31*60000)}});
}
test('浏览器同源 POST 和开发跨域可登录，其他跨域返回 403', async () => {
  for (const origin of [base,'http://localhost:5500']) {
    const result=await request('/auth/login','POST',{phone:'13800008001',password:'123456'},undefined,{Origin:origin}); assert.equal(result.status,200);
  }
  assert.equal((await request('/auth/login','POST',{phone:'13800008001',password:'123456'},undefined,{Origin:'https://unexpected.example'})).status,403);
});
test('真实 bcrypt 登录，连续三次失败锁定五分钟且到期可解锁', async () => {
  for (let i=0;i<3;i++) assert.equal((await request('/auth/login','POST',{phone:'13800008001',password:'wrong'})).status,i===2?423:401);
  const user = await models.User.findById('U1'); assert.equal(user.failedAttempts,3); assert.equal(user.status,'locked');
  assert.ok(user.lockedUntil.getTime()-Date.now()>4*60000);
  assert.equal((await request('/auth/login','POST',{phone:user.phone,password:'123456'})).status,423);
  await models.User.updateOne({_id:'U1'},{$set:{lockedUntil:new Date(Date.now()-1000)}});
  await login(); assert.equal((await models.User.findById('U1')).failedAttempts,0);
});
test('下单事务扣当天余票，重复请求不重复扣减，库存按日期隔离', async () => {
  const token = await login();
  const result = await request('/orders','POST',booking(),token); assert.equal(result.status,201);
  const again = await request('/orders','POST',booking(),token); assert.equal(again.data.order.id,result.data.order.id);
  assert.equal((await models.Inventory.findOne({date:tomorrow})).remaining,1);
  assert.equal((await models.Inventory.findOne({date:afterTomorrow})).remaining,2);
  assert.equal(await models.Order.countDocuments(),1);
});
test('并发下单不超卖；失败事务不会留下订单', async () => {
  const token = await login();
  const results = await Promise.all([1,2,3,4].map(i => request('/orders','POST',booking('concurrent'+i),token)));
  assert.equal(results.filter(r=>r.status===201).length,2); assert.equal(results.filter(r=>r.status===409).length,2);
  assert.equal((await models.Inventory.findOne({date:tomorrow})).remaining,0); assert.equal(await models.Order.countDocuments(),2);
});
test('订单关联后禁改核心字段，负票价/负余票及删除均被拒绝', async () => {
  const p = await login(), a = await login('13800008003');
  await request('/orders','POST',booking(),p);
  for (const field of ['trainNumber','departureStation','arrivalStation']) assert.equal((await request('/admin/trains/T1','PUT',{[field]:'G99'},a)).status,409);
  assert.equal((await request('/admin/trains/T1','PUT',{seats:[{seatType:'二等座',price:-1,remaining:1}]},a)).status,400);
  assert.equal((await request('/admin/trains/T1','PUT',{seats:[{seatType:'二等座',price:1,remaining:-1}]},a)).status,400);
  assert.equal((await request('/admin/trains/T1','DELETE',undefined,a)).status,409);
  assert.equal((await request('/admin/trains/T1','PUT',{bookable:false},a)).status,200);
});
test('旅客和售票员越权接口返回 403，旅客不能冒充管理员注册', async () => {
  const p = await login(), c = await login('13800008002');
  for (const token of [p,c]) assert.equal((await request('/admin/users','GET',undefined,token)).status,403);
  assert.equal((await request('/orders/all','GET',undefined,p)).status,403);
  assert.equal((await request('/clerk/orders/issue','POST',booking(),p)).status,403);
  assert.equal((await request('/auth/register','POST',{role:'admin'})).status,403);
});
test('旅客订单后端隔离，无法支付他人订单；管理员可查看所有订单', async () => {
  const p1=await login(),p2=await login('13800008004'),a=await login('13800008003');
  const {data:{order}}=await request('/orders','POST',booking(),p1);
  assert.equal((await request('/orders','GET',undefined,p2)).data.orders.length,0);
  assert.equal((await request('/orders/'+order.id+'/pay','POST',{},p2)).status,404);
  assert.equal((await request('/orders/all','GET',undefined,a)).data.orders.length,1);
});
test('重复模拟支付和退票不重复记账，退款只释放一次库存', async () => {
  const token=await login(); const {data:{order}}=await request('/orders','POST',booking(),token);
  for(let i=0;i<2;i++) assert.equal((await request('/orders/'+order.id+'/pay','POST',{},token)).status,200);
  for(let i=0;i<2;i++) assert.equal((await request('/orders/'+order.id+'/refund','POST',{},token)).status,200);
  assert.equal(await models.PaymentRecord.countDocuments(),1); assert.equal(await models.RefundRecord.countDocuments(),1);
  assert.equal((await models.Inventory.findOne({date:tomorrow})).remaining,2);
  assert.equal((await models.RefundRecord.findOne()).amount,494.47);
});
test('30 分钟空闲会话返回 401', async () => {
  const token=await login(); await expireSession(token);
  assert.equal((await request('/auth/me','GET',undefined,token)).status,401);
});
test('管理员修改角色后旧 JWT 失效，用户列表仅返回脱敏资料', async () => {
  const p=await login(),a=await login('13800008003');
  const {data:{users}}=await request('/admin/users','GET',undefined,a);
  assert.equal(users.find(u=>u.id==='U1').phone,undefined); assert.equal(users.find(u=>u.id==='U1').passwordHash,undefined);
  assert.equal((await request('/admin/users/U1/role','PATCH',{role:'clerk'},a)).status,200);
  assert.equal((await request('/auth/me','GET',undefined,p)).status,401);
});
test('售票员可为旅客出票但不能为管理员出票', async () => {
  const c=await login('13800008002');
  assert.equal((await request('/clerk/orders/issue','POST',{...booking(),userId:'A1'},c)).status,404);
  const result=await request('/clerk/orders/issue','POST',{...booking(),userId:'U1'},c);
  assert.equal(result.status,201); assert.equal(result.data.order.status,'paid'); assert.equal(result.data.order.issuedBy,'C1');
});
test('改签失败保留原票，改签成功原票关闭并释放原库存', async () => {
  const token=await login(); const {data:{order}}=await request('/orders','POST',booking(),token);
  await request('/orders/'+order.id+'/pay','POST',{},token);
  assert.equal((await request('/orders/'+order.id+'/reschedule','POST',{...booking(),trainId:'missing'},token)).status,404);
  assert.equal((await models.Order.findById(order.id)).status,'paid');
  const result=await request('/orders/'+order.id+'/reschedule','POST',booking('change',afterTomorrow),token);
  assert.equal(result.status,200); assert.equal((await models.Order.findById(order.id)).status,'changed');
  assert.equal((await models.Inventory.findOne({date:tomorrow})).remaining,2); assert.equal((await models.Inventory.findOne({date:afterTomorrow})).remaining,1);
});
test('支付超时和定时取消释放库存一次', async () => {
  const token=await login(); const {data:{order}}=await request('/orders','POST',booking(),token);
  await models.Order.updateOne({_id:order.id},{$set:{expiresAt:new Date(Date.now()-1000)}});
  assert.equal((await request('/orders/'+order.id+'/pay','POST',{},token)).status,409);
  await expireOrders(); assert.equal((await models.Inventory.findOne({date:tomorrow})).remaining,2);
});
test('注册密码使用 10 轮 bcrypt；用户不能从静态服务读取环境配置', async () => {
  const result=await request('/auth/register','POST',{phone:'13900008001',password:'123456',realName:'测试旅客',idNumber:'TEST0001'});
  assert.equal(result.status,201);
  const user=await models.User.findOne({phone:'13900008001'}).select('+passwordHash'); assert.equal(bcrypt.getRounds(user.passwordHash),10); assert.ok(await bcrypt.compare('123456',user.passwordHash));
  assert.equal((await fetch(base+'/server/.env')).status,404);
  assert.equal((await fetch(base+'/pages/login.html')).status,200);
});
test('seed 导入八条车次和四个 bcrypt 用户，重跑不重置库存', async () => {
  await Promise.all(Object.values(models).map(model => model.deleteMany({})));
  const options = {cwd:path.resolve(__dirname,'../../..'), env:{...process.env, MONGO_URI:replica.getUri('mini12306_test'), JWT_SECRET:'seed-test-secret-longer-than-32-characters'}, encoding:'utf8', timeout:60000};
  const seedPath = path.resolve(__dirname,'../../src/seed.js');
  execFileSync(process.execPath,[seedPath],options);
  assert.equal(await models.User.countDocuments(),4); assert.equal(await models.Train.countDocuments(),8); assert.equal(await models.Order.countDocuments(),3);
  for(const user of await models.User.find().select('+passwordHash')) { assert.equal(bcrypt.getRounds(user.passwordHash),10); assert.ok(await bcrypt.compare('123456',user.passwordHash)); }
  const stock = await models.Inventory.find().sort({_id:1}).lean();
  execFileSync(process.execPath,[seedPath],options);
  assert.equal(await models.Order.countDocuments(),3); assert.deepEqual((await models.Inventory.find().sort({_id:1}).lean()).map(i=>[i._id,i.remaining]),stock.map(i=>[i._id,i.remaining]));
});

test('回归：低价改签后仍可退票，重复退票不重复退款或释放库存', async () => {
  const token=await login();
  const {data:{order}}=await request('/orders','POST',booking(),token);
  await request('/orders/'+order.id+'/pay','POST',{},token);
  await models.Train.updateOne({_id:'T1'},{$set:{'seats.0.price':300}});
  const changed=await request('/orders/'+order.id+'/reschedule','POST',booking('change',afterTomorrow),token);
  assert.equal(changed.status,200);
  const newId=changed.data.order.id;
  for(let i=0;i<2;i++) assert.equal((await request('/orders/'+newId+'/refund','POST',{},token)).status,200);
  const records=await models.RefundRecord.find({orderId:newId});
  assert.equal(records.length,2);
  assert.deepEqual(records.map(record=>record.amount).sort((a,b)=>a-b),[220.5,285]);
  assert.equal((await models.Order.findById(newId)).status,'refunded');
  assert.equal((await models.Order.findById(order.id)).status,'changed');
  assert.equal((await models.Inventory.findOne({date:tomorrow})).remaining,2);
  assert.equal((await models.Inventory.findOne({date:afterTomorrow})).remaining,2);
});
test('回归：空闲失效后重新登录，旧令牌不能恢复有效', async () => {
  const oldToken=await login(); await expireSession(oldToken);
  assert.equal((await request('/auth/me','GET',undefined,oldToken)).status,401);
  const newToken=await login();
  assert.equal((await request('/auth/me','GET',undefined,newToken)).status,200);
  assert.equal((await request('/auth/me','GET',undefined,oldToken)).status,401);
});
test('回归：角色往返后旧令牌保持失效，重新登录使用当前角色', async () => {
  const oldToken=await login(), admin=await login('13800008003');
  assert.equal((await request('/admin/users/U1/role','PATCH',{role:'clerk'},admin)).status,200);
  assert.equal((await request('/auth/me','GET',undefined,oldToken)).status,401);
  assert.equal((await request('/admin/users/U1/role','PATCH',{role:'passenger'},admin)).status,200);
  assert.equal((await request('/auth/me','GET',undefined,oldToken)).status,401);
  const fresh=await login();
  assert.equal((await request('/auth/me','GET',undefined,fresh)).data.user.role,'passenger');
});
test('独立登录分别计时，过期会话不能用活动心跳复活', async () => {
  const first=await login(), second=await login();
  assert.notEqual(first,second);
  assert.equal((await request('/auth/me','GET',undefined,first)).status,200);
  await expireSession(first);
  assert.equal((await request('/auth/activity','POST',{},first,{'X-User-Activity':'1'})).status,401);
  assert.equal((await request('/auth/me','GET',undefined,second)).status,200);
  const legacy=jwt.sign({role:'passenger'},'test-secret-that-is-at-least-32-characters',{subject:'U1',expiresIn:'8h',issuer:'mini12306'});
  assert.equal((await request('/auth/me','GET',undefined,legacy)).status,401);
});
test('旧退款索引升级保留历史流水，并允许同票的两种退款事件', async () => {
  const collection=models.RefundRecord.collection;
  await collection.createIndex({orderId:1},{unique:true});
  await collection.insertMany([
    {_id:'legacy-difference',orderId:'old-new-ticket',amount:40,method:'改签原路模拟退款',status:'success'},
    {_id:'legacy-ticket',orderId:'another-ticket',amount:95,method:'原路模拟退款',status:'success'}
  ]);
  await initializeModels(); await initializeModels();
  assert.equal((await collection.findOne({_id:'legacy-difference'})).eventType,'reschedule_difference');
  assert.equal((await collection.findOne({_id:'legacy-ticket'})).eventType,'ticket_refund');
  await models.RefundRecord.create({orderId:'old-new-ticket',amount:57,eventType:'ticket_refund',status:'success'});
  await assert.rejects(models.RefundRecord.create({orderId:'old-new-ticket',amount:57,eventType:'ticket_refund'}),{code:11000});
  assert.equal(await collection.countDocuments(),3);
  assert.ok(!(await collection.indexes()).some(index=>index.unique && Object.keys(index.key).length===1 && index.key.orderId===1));
});

test('O04 扣票后校验他人乘车人失败，订单和库存完整回滚', async () => {
  const token=await login();
  await models.Passenger.create({_id:'P-OTHER', ownerUserId:'U2', nameMasked:'陈*雨', idNumberMasked:'420105********2468'});
  const before=await models.Train.findById('T1');
  const result=await request('/orders','POST',{...booking('foreign-passenger'), passengerId:'P-OTHER'},token);
  assert.equal(result.status,403);
  assert.equal(await models.Order.countDocuments(),0);
  assert.equal((await models.Inventory.findOne({trainId:'T1', date:tomorrow, seatType:'二等座'})).remaining,2);
  assert.equal((await models.Train.findById('T1')).revision,before.revision);
  assert.equal(await models.PaymentRecord.countDocuments(),0);
});

test('O05 不经过支付接口，后台清理仍能释放超时订单且不重复释放', async () => {
  const token=await login();
  const result=await request('/orders','POST',booking('expire-only'),token);
  assert.equal(result.status,201);
  const id=result.data.order.id;
  assert.equal((await models.Inventory.findOne({date:tomorrow})).remaining,1);
  // 仅调整测试库时间，不等待真实十五分钟，也不调用 pay/cancel。
  await models.Order.updateOne({_id:id},{$set:{expiresAt:new Date(Date.now()-1000)}});
  await expireOrders();
  await expireOrders();
  assert.equal((await models.Order.findById(id)).status,'cancelled');
  assert.equal((await models.Inventory.findOne({date:tomorrow})).remaining,2);
  assert.equal(await models.PaymentRecord.countDocuments(),0);
});

test('A02 缺失、伪造签名和超过有效期的 JWT 均被拒绝', async () => {
  assert.equal((await request('/auth/me')).status,401);
  const token=await login();
  const parts=token.split('.');
  parts[2]=(parts[2][0]==='a'?'b':'a')+parts[2].slice(1);
  assert.equal((await request('/auth/me','GET',undefined,parts.join('.'))).status,401);
  // 使用正确的测试签名密钥，只让 exp 过期，单独覆盖有效期判断。
  const expired=jwt.sign({role:'passenger', authVersion:0},'test-secret-that-is-at-least-32-characters',{
    subject:'U1', jwtid:jwt.decode(token).jti, issuer:'mini12306', expiresIn:-1
  });
  assert.equal((await request('/auth/me','GET',undefined,expired)).status,401);
  assert.equal((await request('/auth/me','GET',undefined,token)).status,200);
});

test('第二轮优化：管理员新增、修改、删除车次提交后立即失效站点缓存', async () => {
  const passenger = await login(), admin = await login('13800008003');
  const stations = async () => {
    const response = await request('/trains/stations','GET',undefined,passenger);
    assert.equal(response.status,200);
    assert.deepEqual(Object.keys(response.data),['stations']);
    return response.data.stations;
  };
  assert.ok(!(await stations()).includes('长沙'));
  const input = {...trainData, trainNumber:'G99', departureCity:'长沙', departureStation:'长沙南', arrivalCity:'南京', arrivalStation:'南京南', stops:['长沙南','南京南']};
  const created = await request('/admin/trains','POST',input,admin);
  assert.equal(created.status,201);
  assert.ok((await stations()).includes('长沙'));
  const id = created.data.train.id;
  const changed = await request('/admin/trains/'+id,'PUT',{departureCity:'苏州',departureStation:'苏州北'},admin);
  assert.equal(changed.status,200);
  const afterUpdate = await stations();
  assert.ok(afterUpdate.includes('苏州北'));
  assert.ok(!afterUpdate.includes('长沙'));
  assert.equal((await request('/admin/trains/'+id,'DELETE',undefined,admin)).status,204);
  const afterDelete = await stations();
  assert.ok(!afterDelete.includes('苏州北'));
  assert.ok(!afterDelete.includes('南京'));
});

test('第二轮优化：并发过期清理实际只释放一次库存且后续轮次正常', async () => {
  const token = await login();
  for (const requestId of ['round-one','round-two']) {
    const created = await request('/orders','POST',booking(requestId),token);
    assert.equal(created.status,201);
    const id = created.data.order.id;
    await models.Order.updateOne({_id:id},{$set:{expiresAt:new Date(Date.now()-1000)}});
    await Promise.all(Array.from({length:10}, () => expireOrders()));
    assert.equal((await models.Order.findById(id)).status,'cancelled');
    assert.equal((await models.Inventory.findOne({trainId:'T1',date:tomorrow,seatType:'二等座'})).remaining,2);
  }
});

test('第二轮优化：测试数据库创建过期复合索引并保留用户订单索引', async () => {
  const indexes = await models.Order.collection.indexes();
  assert.ok(indexes.some(index => JSON.stringify(Object.entries(index.key)) === JSON.stringify([['status',1],['expiresAt',1]])));
  assert.ok(indexes.some(index => JSON.stringify(Object.entries(index.key)) === JSON.stringify([['userId',1],['status',1]])));
  assert.ok(indexes.some(index => index.unique && index.key.orderNumber === 1));
  assert.ok(indexes.some(index => index.unique && index.key.userId === 1 && index.key.requestId === 1));
});
