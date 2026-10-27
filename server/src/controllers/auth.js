const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, Passenger, Session } = require('../models');
const { randomUUID } = require('node:crypto');
const mongoose = require('mongoose');
const { assert, HttpError } = require('../utils/errors');
const valid = require('../utils/validation');
const { safeUser, maskName, maskId } = require('../utils/serialize');
const { failurePipeline } = require('../utils/auth-state');
function authController(config) {
  async function register(req, res) {
    // 不信任客户端传入的 role，公开注册始终创建旅客。
    assert(req.body.role === undefined || req.body.role === 'passenger', 403, '注册只能创建旅客账号');
    const phone = valid.phone(req.body.phone);
    const passwordHash = await bcrypt.hash(valid.password(req.body.password), 10);
    const realName = valid.text(req.body.realName, '姓名', 40);
    const idNumber = valid.text(req.body.idNumber, '证件号码', 40);
    let user;
    await mongoose.connection.transaction(async session => {
      [user] = await User.create([{account: valid.text(req.body.account || phone, '账号', 40), phone, passwordHash, realName, idNumber, role: 'passenger', verified: false}], {session});
      await Passenger.create([{ownerUserId: user._id, nameMasked: maskName(realName), idType: '居民身份证', idNumberMasked: maskId(idNumber), passengerType: '成人'}], {session});
    });
    res.status(201).json({user: safeUser(user)});
  }
  async function login(req, res) {
    const phone = valid.phone(req.body.phone);
    assert(typeof req.body.password === 'string' && req.body.password.length > 0 && req.body.password.length <= 200, 400, '请输入密码');
    let user = await User.findOne({phone}).select('+passwordHash');
    if (!user) throw new HttpError(401, '手机号或密码错误');
    const now = new Date();
    if (user.status === 'locked' && (!user.lockedUntil || user.lockedUntil > now)) throw new HttpError(423, '账号暂时锁定，请 5 分钟后重试');
    // 解锁通过条件更新，保留并发请求刚刚设置的锁定。
    await User.updateOne({_id: user._id, status: 'locked', lockedUntil: {$lte: now}}, {$set: {status: 'active', failedAttempts: 0, lockedUntil: null}});
    if (!await bcrypt.compare(req.body.password, user.passwordHash)) {
      const failed = await User.findOneAndUpdate({_id: user._id, status: 'active'}, failurePipeline(now), {new: true});
      throw new HttpError(failed?.status === 'locked' ? 423 : 401, failed?.status === 'locked' ? '密码错误 3 次，账号锁定 5 分钟' : '手机号或密码错误');
    }
    user = await User.findOneAndUpdate({_id: user._id, status: 'active'}, {$set: {failedAttempts: 0, lockedUntil: null, lastActiveAt: now}}, {new: true});
    assert(user, 423, '账号已被锁定，请稍后重试');
    const sessionId = randomUUID();
    const token = jwt.sign({role: user.role, authVersion: user.authVersion}, config.jwtSecret, {subject: user._id, jwtid: sessionId, expiresIn: config.jwtExpiresIn, algorithm: 'HS256', issuer: 'mini12306'});
    await Session.create({_id: sessionId, userId: user._id, authVersion: user.authVersion, lastActiveAt: now, expiresAt: new Date(jwt.decode(token).exp * 1000)});
    res.json({token, user: safeUser(user)});
  }
  const me = (req, res) => res.json({user: safeUser(req.user)});
  return {register, login, me};
}
module.exports = { authController };
