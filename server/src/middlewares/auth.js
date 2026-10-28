const jwt = require('jsonwebtoken');
const { User, Session } = require('../models');
const { HttpError, asyncHandler } = require('../utils/errors');
const SESSION_TIMEOUT = 30 * 60 * 1000;
function authenticate(config) {
  return asyncHandler(async (req, res, next) => {
    let payload;
    try { payload = jwt.verify((req.headers.authorization || '').replace(/^Bearer /, ''), config.jwtSecret, {algorithms: ['HS256'], issuer: 'mini12306'}); }
    catch { throw new HttpError(401, '登录已过期，请重新登录'); }
    const user = await User.findById(payload.sub);
    if (!user || user.status !== 'active' || payload.role !== user.role || typeof payload.jti !== 'string' || payload.authVersion !== user.authVersion) throw new HttpError(401, '登录已失效，请重新登录');
    const now = new Date();
    const filter = {_id: payload.jti, userId: user._id, authVersion: user.authVersion, expiresAt: {$gt: now}, lastActiveAt: {$gt: new Date(now.getTime() - SESSION_TIMEOUT)}};
    // 活动更新也必须满足尚未空闲过期，不能用心跳复活旧会话。
    const session = req.headers['x-user-activity'] === '1'
      ? await Session.findOneAndUpdate(filter, {$set: {lastActiveAt: now}}, {new: true})
      : await Session.findOne(filter);
    if (!session) throw new HttpError(401, '登录已失效，请重新登录');
    req.user = user;
    req.sessionId = payload.jti;
    next();
  });
}
function requireRole(...roles) { return (req, res, next) => req.user && roles.includes(req.user.role) ? next() : next(new HttpError(403, '没有权限执行此操作')); }
module.exports = { authenticate, requireRole, SESSION_TIMEOUT };
