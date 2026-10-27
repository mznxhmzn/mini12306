class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
// Express 4 不会自动捕获异步处理函数的错误。
const asyncHandler = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
function assert(condition, status, message) { if (!condition) throw new HttpError(status, message); }
module.exports = { HttpError, asyncHandler, assert };
