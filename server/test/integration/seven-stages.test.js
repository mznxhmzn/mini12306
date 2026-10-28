/** 七阶段增量验收：独立副本集，不连接演示服务。 */
const {test,before,after,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const mongoose=require('mongoose');
const bcrypt=require('bcryptjs');
const {MongoMemoryReplSet}=require('mongodb-memory-server');
const {createApp}=require('../../src/app');
const m=require('../../src/models');
const {initializeModels}=require('../../src/utils/initialize-models');
const {invalidateStationCache}=require('../../src/utils/station-cache');
let replica,server,base,hash;
const date=new Date(Date.now()+4*86400000).toISOString().slice(0,10);
before(async()=>{
  replica=await MongoMemoryReplSet.create({binary:{version:'7.0.14',downloadDir:path.resolve(__dirname,'../../../.cache/mongodb')},replSet:{count:1,storageEngine:'wiredTiger'}});
  await mongoose.connect(replica.getUri('seven_stages'));await initializeModels();hash=await bcrypt.hash('123456',10);
  server=createApp({jwtSecret:'seven-stages-test-secret-more-than-32-chars',jwtExpiresIn:'8h',origins:[]}).listen(0,'127.0.0.1');
  await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;
},{timeout:300000});
after(async()=>{if(server)await new Promise(r=>server.close(r));await mongoose.disconnect();if(replica)await replica.stop();});
beforeEach(async()=>{
  invalidateStationCache();await Promise.all(Object.values(m).map(model=>model.deleteMany({})));
  await m.User.create([{_id:'P',account:'passenger',phone:'13800008001',passwordHash:hash,role:'passenger',realName:'张小明',idNumber:'ID-P'},{_id:'Q',account:'other',phone:'13800008004',passwordHash:hash,role:'passenger',realName:'陈小雨',idNumber:'ID-Q'},{_id:'A',account:'admin',phone:'13800008003',passwordHash:hash,role:'admin',realName:'王小安'},{_id:'C',account:'clerk',phone:'13800008002',passwordHash:hash,role:'clerk',realName:'李小华'}]);
  for(const [id,number,arrival,price] of [['T','G66','北京',100],['N','G77','上海',60]]){
    await m.Train.create({_id:id,trainNumber:number,trainType:'高速动车',departureCity:'武汉',arrivalCity:arrival,departureStation:'武汉',arrivalStation:arrival,departureTime:'12:00',arrivalTime:'16:00',durationMinutes:240,operatingDates:[date],bookable:true,seats:[{seatType:'二等座',price,remaining:10}]});
    await m.Inventory.create({trainId:id,date,seatType:'二等座',remaining:10});
  }
});
async function req(url,method='GET',body,token){const r=await fetch(base+'/api'+url,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:r.status===204?{}:await r.json()};}
async function login(phone='13800008001'){const r=await req('/auth/login','POST',{phone,password:'123456'});assert.equal(r.status,200);return r.data.token;}
const body=(requestId='one',trainId='T')=>({trainId,departureDate:date,seatType:'二等座',requestId});
const passenger={name:'测试旅客',idType:'居民身份证',idNumber:'420106200001011234'};
async function paid(token,requestId='paid',trainId='T'){const r=await req('/orders','POST',body(requestId,trainId),token);assert.equal(r.status,201);const payment=await req('/orders/'+r.data.order.id+'/pay','POST',{},token);assert.equal(payment.status,200);return payment.data.order;}
test('阶段1：新增乘车人只输出脱敏字段，数据库保留明文',async()=>{
  const p=await login();const r=await req('/passengers','POST',passenger,p);assert.equal(r.status,201);assert.equal(r.data.passenger.name,undefined);assert.equal(r.data.passenger.idNumber,undefined);assert.equal(r.data.passenger.idNumberMasked,'420106********1234');assert.equal((await m.Passenger.findById(r.data.passenger.id)).name,passenger.name);
});
test('阶段1：他人乘车人修改和删除被拒绝',async()=>{
  const p=await login(),q=await login('13800008004');const id=(await req('/passengers','POST',passenger,p)).data.passenger.id;
  assert.equal((await req('/passengers/'+id,'PUT',{name:'篡改'},q)).status,404);assert.equal((await req('/passengers/'+id,'DELETE',undefined,q)).status,404);assert.equal((await m.Passenger.findById(id)).name,passenger.name);
});
test('阶段1：同用户重复证件拒绝，不同用户允许',async()=>{
  const p=await login(),q=await login('13800008004');assert.equal((await req('/passengers','POST',passenger,p)).status,201);assert.equal((await req('/passengers','POST',passenger,p)).status,409);assert.equal((await req('/passengers','POST',passenger,q)).status,201);
});
test('阶段1：删除乘车人不影响历史订单',async()=>{
  const p=await login();const id=(await req('/passengers','POST',passenger,p)).data.passenger.id;const order=(await req('/orders','POST',{...body(),passengerId:id},p)).data.order;
  assert.equal((await req('/passengers/'+id,'DELETE',undefined,p)).status,204);const r=await req('/orders/'+order.id,'GET',undefined,p);assert.equal(r.status,200);assert.equal(r.data.order.passengerNameMasked,'测*客');
});
test('阶段1：二十人上限与合法编辑',async()=>{
  const p=await login();await m.Passenger.insertMany(Array.from({length:20},(_,i)=>({ownerUserId:'P',name:'测试',idType:'居民身份证',idNumber:'ID-'+i})));
  assert.equal((await req('/passengers','POST',passenger,p)).status,409);const item=await m.Passenger.findOne({ownerUserId:'P'});assert.equal((await req('/passengers/'+item.id,'PUT',{name:'更新姓名'},p)).status,200);
});
test('阶段2：支付分配座位，重复支付不改变且不重复记账',async()=>{
  const p=await login();const order=await paid(p);assert.ok(order.carNumber&&order.seatNumber);const again=await req('/orders/'+order.id+'/pay','POST',{},p);assert.equal(again.data.order.carNumber,order.carNumber);assert.equal(again.data.order.seatNumber,order.seatNumber);assert.equal(await m.PaymentRecord.countDocuments(),1);
});
test('阶段2：退票保留历史座位字段',async()=>{
  const p=await login(),order=await paid(p);assert.equal((await req('/orders/'+order.id+'/refund','POST',{},p)).status,200);const old=await m.Order.findById(order.id);assert.equal(old.carNumber,order.carNumber);assert.equal(old.seatNumber,order.seatNumber);
});
test('阶段2：并发支付和柜台出票座位不冲突',async()=>{
  const p=await login(),c=await login('13800008002');const ids=await Promise.all(['x','y'].map(async key=>(await req('/orders','POST',body(key),p)).data.order.id));const orders=await Promise.all(ids.map(async id=>(await req('/orders/'+id+'/pay','POST',{},p)).data.order));const issued=await req('/clerk/orders/issue','POST',{...body('counter'),userId:'P'},c);assert.equal(issued.status,201);orders.push(issued.data.order);assert.equal(new Set(orders.map(o=>o.carNumber+'|'+o.seatNumber)).size,3);
});
test('阶段3：状态多值过滤只返回匹配订单',async()=>{
  const p=await login();await paid(p);await req('/orders','POST',body('pending'),p);const r=await req('/orders?status=paid,refunded','GET',undefined,p);assert.equal(r.status,200);assert.equal(r.data.total,1);assert.equal(r.data.orders[0].status,'paid');
});
test('阶段3：limit、total、hasMore 及页码正确',async()=>{
  const p=await login();await req('/orders','POST',body('a'),p);await req('/orders','POST',body('b'),p);const r=await req('/orders?limit=1&page=1','GET',undefined,p);assert.equal(r.data.orders.length,1);assert.equal(r.data.total,2);assert.equal(r.data.hasMore,true);const next=await req('/orders?limit=1&page=2','GET',undefined,p);assert.equal(next.data.hasMore,false);assert.notEqual(r.data.orders[0].id,next.data.orders[0].id);
});
test('阶段3：关键词查不到他人订单，非法分页拒绝',async()=>{
  const p=await login(),q=await login('13800008004');const o=(await req('/orders','POST',body(),p)).data.order;const r=await req('/orders?keyword='+o.orderNumber,'GET',undefined,q);assert.equal(r.data.total,0);assert.equal((await req('/orders?page=0','GET',undefined,p)).status,400);
});
test('阶段4：服务端预览与退款记录一致，重复退票不重复退',async()=>{
  const p=await login(),order=await paid(p);const preview=await req('/orders/'+order.id+'/refund-quote','GET',undefined,p);assert.equal(preview.data.quote.feeAmount,5);for(let i=0;i<2;i++)assert.equal((await req('/orders/'+order.id+'/refund','POST',{},p)).status,200);const records=await m.RefundRecord.find({orderId:order.id});assert.equal(records.length,1);assert.equal(records[0].amount,95);assert.equal(records[0].feeAmount,5);
});
test('阶段5：跨城市改签成功、新座位有效且原单不可重复改签',async()=>{
  const p=await login(),order=await paid(p);const r=await req('/orders/'+order.id+'/reschedule','POST',body('change','N'),p);assert.equal(r.status,200);assert.equal(r.data.order.arrivalCity,'上海');assert.ok(r.data.order.seatNumber);assert.equal((await m.Order.findById(order.id)).status,'changed');assert.equal((await req('/orders/'+order.id+'/reschedule','POST',body('again','N'),p)).status,409);assert.equal((await m.Inventory.findOne({trainId:'T'})).remaining,10);assert.equal((await m.Inventory.findOne({trainId:'N'})).remaining,9);
});
test('阶段5：目标无余票时整体回滚',async()=>{
  const p=await login(),order=await paid(p);await m.Inventory.updateOne({trainId:'N'},{$set:{remaining:0}});assert.equal((await req('/orders/'+order.id+'/reschedule','POST',body('change','N'),p)).status,409);assert.equal((await m.Order.findById(order.id)).status,'paid');assert.equal(await m.Order.countDocuments(),1);assert.equal((await m.Inventory.findOne({trainId:'T'})).remaining,9);assert.equal((await m.Inventory.findOne({trainId:'N'})).remaining,0);
});
test('阶段5：低价退差唯一、高价只补差、脱敏信息保留',async()=>{
  const p=await login(),order=await paid(p);const r=await req('/orders/'+order.id+'/reschedule','POST',body('down','N'),p);const refund=await m.RefundRecord.findOne({orderId:r.data.order.id});assert.equal(refund.eventType,'reschedule_difference');assert.equal(refund.amount,40);assert.equal(await m.RefundRecord.countDocuments(),1);assert.equal(r.data.order.passengerNameMasked,order.passengerNameMasked);const up=await req('/orders/'+r.data.order.id+'/reschedule','POST',body('up','T'),p);assert.equal(up.status,200);assert.equal((await m.PaymentRecord.findOne({orderId:up.data.order.id})).amount,40);
});
test('阶段6：旧密码错误不改密，合法改密使所有旧JWT失效',async()=>{
  const first=await login(),second=await login();assert.equal((await req('/auth/change-password','POST',{oldPassword:'wrong',newPassword:'654321'},first)).status,400);assert.equal((await req('/auth/me','GET',undefined,first)).status,200);const r=await req('/auth/change-password','POST',{oldPassword:'123456',newPassword:'654321'},first);assert.equal(r.status,200);assert.equal(r.data.requiresLogin,true);for(const token of [first,second])assert.equal((await req('/auth/me','GET',undefined,token)).status,401);assert.equal((await req('/auth/login','POST',{phone:'13800008001',password:'654321'})).status,200);
});
test('阶段6：服务端登出后令牌不能重放',async()=>{
  const p=await login();assert.equal((await req('/auth/logout','POST',{},p)).status,200);assert.equal((await req('/auth/me','GET',undefined,p)).status,401);assert.equal(await m.Session.countDocuments({userId:'P'}),0);
});
test('阶段6：三要素错误五次锁定十五分钟，锁定中正确核验仍拒绝',async()=>{
  const fields={account:'passenger',phone:'13800008001',idNumber:'WRONG',newPassword:'654321'};for(let i=0;i<5;i++)assert.equal((await req('/auth/reset-password','POST',fields)).status,i===4?423:401);const user=await m.User.findById('P');assert.equal(user.failedAttempts,5);assert.equal(user.status,'locked');assert.ok(user.lockedUntil-Date.now()>14*60000);assert.equal((await req('/auth/reset-password','POST',{...fields,idNumber:'ID-P'})).status,423);
});
test('阶段6：正确演示身份可重置密码，管理员不能使用旅客找回入口',async()=>{
  const p=await login();assert.equal((await req('/auth/reset-password','POST',{account:'passenger',phone:'13800008001',idNumber:'ID-P',newPassword:'654321'})).status,200);assert.equal((await req('/auth/me','GET',undefined,p)).status,401);assert.equal((await req('/auth/login','POST',{phone:'13800008001',password:'654321'})).status,200);assert.equal((await req('/auth/reset-password','POST',{account:'admin',phone:'13800008003',idNumber:'anything',newPassword:'654321'})).status,403);
});
test('阶段7：聚合状态、票款、退差与线路统计匹配手工数据，日期边界隔离',async()=>{
  const a=await login('13800008003');
  const createdAt=new Date('2026-10-20T10:00:00+08:00');
  await m.Order.collection.insertMany(['paid','pending','refunded','changed','cancelled'].map((status,i)=>({_id:'S'+i,orderNumber:'STAT'+i,userId:'P',trainId:'T',trainNumber:'G66',departureCity:'武汉',arrivalCity:'北京',status,amount:100,createdAt,...(status==='cancelled'?{cancelReason:'timeout',cancelledAt:createdAt}:{})})));
  await m.Order.collection.insertOne({_id:'outside',orderNumber:'OUT',userId:'P',trainId:'T',status:'paid',createdAt:new Date('2026-10-21T00:00:00+08:00')});
  await m.PaymentRecord.collection.insertMany([{_id:'payment',orderId:'S0',amount:100,status:'success',createdAt},{_id:'topup',orderId:'S3',amount:20,status:'success',createdAt},{_id:'failed',orderId:'S1',amount:999,status:'failed',createdAt}]);
  await m.RefundRecord.collection.insertMany([{_id:'refund',orderId:'S2',eventType:'ticket_refund',amount:95,status:'success',createdAt},{_id:'difference',orderId:'S3',eventType:'reschedule_difference',amount:40,status:'success',createdAt}]);
  const r=await req('/admin/stats?date=2026-10-20','GET',undefined,a);assert.equal(r.status,200);
  assert.equal(r.data.totalOrders,5);assert.deepEqual(r.data.statusCounts,{pending:1,paid:1,cancelled:1,refunded:1,changed:1});
  assert.equal(r.data.paidAmount,120);assert.equal(r.data.refundAmount,135);assert.equal(r.data.netAmount,-15);assert.equal(r.data.expiredCleanupCount,1);
  assert.deepEqual(r.data.topTrains,[{trainNumber:'G66',count:1}]);assert.deepEqual(r.data.topRoutes,[{route:'武汉 → 北京',count:1}]);
});
test('阶段7：旅客和售票员不能读取统计，非法日期拒绝，空日返回零',async()=>{
  for(const phone of ['13800008001','13800008002'])assert.equal((await req('/admin/stats','GET',undefined,await login(phone))).status,403);
  const a=await login('13800008003');assert.equal((await req('/admin/stats?date=bad','GET',undefined,a)).status,400);
  const r=await req('/admin/stats?date=2000-01-01','GET',undefined,a);assert.equal(r.status,200);assert.equal(r.data.totalOrders,0);assert.equal(r.data.paidAmount,0);assert.deepEqual(r.data.topTrains,[]);
});
test('阶段7：超时清理记录原因且只计一次，手工取消不计入',async()=>{
  const p=await login(),a=await login('13800008003');const first=(await req('/orders','POST',body('expired'),p)).data.order;
  await m.Order.updateOne({_id:first.id},{$set:{expiresAt:new Date(Date.now()-1000)}});const {expireOrders}=require('../../src/utils/order-service');
  await Promise.all([expireOrders(),expireOrders()]);await expireOrders();
  const second=(await req('/orders','POST',body('manual'),p)).data.order;await req('/orders/'+second.id+'/cancel','POST',{},p);
  const r=await req('/admin/stats','GET',undefined,a);assert.equal(r.data.expiredCleanupCount,1);assert.equal((await m.Order.findById(first.id)).cancelReason,'timeout');assert.equal((await m.Inventory.findOne({trainId:'T'})).remaining,10);
});
test('阶段6：缺少认证版本的旧账号兼容，旧密码空格不被截断',async()=>{
  await m.User.collection.updateOne({_id:'P'},{$unset:{authVersion:1},$set:{passwordHash:await bcrypt.hash(' 123456 ',10)}});
  const r=await req('/auth/login','POST',{phone:'13800008001',password:' 123456 '});assert.equal(r.status,200);const changed=await req('/auth/change-password','POST',{oldPassword:' 123456 ',newPassword:'654321'},r.data.token);assert.equal(changed.status,200);assert.equal((await m.User.findById('P')).authVersion,1);
});
