const mongoose = require('mongoose');
const {Passenger, User} = require('../models');
const {text} = require('../utils/validation');
const {assert} = require('../utils/errors');
const {safePassenger} = require('../utils/serialize');
async function save(req,res) {
  let passenger;
  await mongoose.connection.transaction(async session => {
    // 同一用户写入串行化，避免并发新增超过二十条。
    await User.updateOne({_id:req.user._id},{$inc:{passengerRevision:1}},{session});
    passenger=req.params.id ? await Passenger.findOne({_id:req.params.id,ownerUserId:req.user._id}).session(session) : null;
    if(req.params.id) assert(passenger,404,'乘车人不存在');
    else assert(await Passenger.countDocuments({ownerUserId:req.user._id}).session(session)<20,409,'最多保存 20 位乘车人','PASSENGER_LIMIT');
    const values={};
    for(const [key,max] of [['name',40],['idType',30],['idNumber',40],['passengerType',20]]) if(req.body[key]!==undefined) values[key]=text(req.body[key],key,max);
    if(!passenger) {
      assert(values.name && values.idNumber,400,'请填写姓名和证件号码');
      values.idType ||= '居民身份证'; values.passengerType ||= '成人';
      [passenger]=await Passenger.create([{...values,ownerUserId:req.user._id}],{session});
    } else { Object.assign(passenger,values); await passenger.save({session}); }
  });
  res.status(req.params.id?200:201).json({passenger:safePassenger(passenger)});
}
async function remove(req,res) {
  await mongoose.connection.transaction(async session => {
    await User.updateOne({_id:req.user._id},{$inc:{passengerRevision:1}},{session});
    const result=await Passenger.deleteOne({_id:req.params.id,ownerUserId:req.user._id},{session});
    assert(result.deletedCount,404,'乘车人不存在');
  });
  res.status(204).end();
}
module.exports={save,remove};
