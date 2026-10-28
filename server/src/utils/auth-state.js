const MAX_ATTEMPTS = 3;
const LOCK_MS = 5 * 60 * 1000;
// 使用 Mongo 更新管道原子计数，避免同时登录时丢失失败次数。
function failurePipeline(now = new Date(), maxAttempts = MAX_ATTEMPTS, lockMs = LOCK_MS) {
  return [{$set: {failedAttempts: {$add: [{$ifNull: ['$failedAttempts', 0]}, 1]}}}, {$set: {status: {$cond: [{$gte: ['$failedAttempts', maxAttempts]}, 'locked', 'active']}, lockedUntil: {$cond: [{$gte: ['$failedAttempts', maxAttempts]}, new Date(now.getTime() + lockMs), null]}}}];
}
module.exports = { MAX_ATTEMPTS, LOCK_MS, failurePipeline };
