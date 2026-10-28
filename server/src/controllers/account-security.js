const mongoose=require('mongoose');
const bcrypt=require('bcryptjs');
const {User,Session}=require('../models');
const valid=require('../utils/validation');
const {assert,HttpError}=require('../utils/errors');
const {failurePipeline}=require('../utils/auth-state');
async function changePassword(req,res){
  const current=await User.findById(req.user._id).select('+passwordHash');
  assert(current,401,'账号不存在');
  const oldPassword=req.body.oldPassword;
  assert(typeof oldPassword==='string'&&oldPassword.length>0&&oldPassword.length<=200,400,'请输入旧密码');
  assert(await bcrypt.compare(oldPassword,current.passwordHash),400,'旧密码错误','OLD_PASSWORD_WRONG');
  const passwordHash=await bcrypt.hash(valid.password(req.body.newPassword),10);
  await mongoose.connection.transaction(async session=>{
    const user=await User.findOneAndUpdate({_id:current._id,passwordHash:current.passwordHash,$expr:{$eq:[{$ifNull:['$authVersion',0]},current.authVersion]}},{$set:{passwordHash},$inc:{authVersion:1}},{session,new:true});
    assert(user,409,'账号已更新，请重新登录后重试');
    await Session.deleteMany({userId:current._id,_id:{$ne:req.sessionId}},{session});
  });
  res.json({requiresLogin:true,message:'密码已修改，请重新登录'});
}
async function logout(req,res){await Session.deleteOne({_id:req.sessionId,userId:req.user._id});res.json({ok:true});}
async function resetPassword(req,res){
  const account=valid.text(req.body.account,'账号',40),phone=valid.phone(req.body.phone),idNumber=valid.text(req.body.idNumber,'证件号码',40);
  const password=valid.password(req.body.newPassword);
  let user=await User.findOne({phone});if(!user)user=await User.findOne({account});
  assert(user,401,'身份核验失败','IDENTITY_MISMATCH');
  assert(user.role==='passenger',403,'演示找回密码仅向旅客开放');
  const now=new Date();
  if(user.status==='locked'&&(!user.lockedUntil||user.lockedUntil>now))throw new HttpError(423,'账号暂时锁定，请稍后重试','ACCOUNT_LOCKED');
  await User.updateOne({_id:user._id,status:'locked',lockedUntil:{$lte:now}},{$set:{status:'active',failedAttempts:0,lockedUntil:null}});
  if(user.account!==account||user.phone!==phone||user.idNumber!==idNumber){
    const failed=await User.findOneAndUpdate({_id:user._id,status:'active'},failurePipeline(now,5,15*60000),{new:true});
    throw new HttpError(!failed||failed.status==='locked'?423:401,!failed||failed.status==='locked'?'身份核验失败五次，锁定十五分钟':'身份核验失败','IDENTITY_MISMATCH');
  }
  const passwordHash=await bcrypt.hash(password,10);
  await mongoose.connection.transaction(async session=>{
    const updated=await User.findOneAndUpdate({_id:user._id,role:'passenger',status:'active',$expr:{$eq:[{$ifNull:['$authVersion',0]},user.authVersion]}},{$set:{passwordHash,failedAttempts:0,lockedUntil:null},$inc:{authVersion:1}},{session,new:true});
    assert(updated,409,'账号状态已变化，请重试');
    await Session.deleteMany({userId:user._id},{session});
  });
  res.json({requiresLogin:true,message:'演示身份核验完成，密码已重置'});
}
module.exports={changePassword,logout,resetPassword};
