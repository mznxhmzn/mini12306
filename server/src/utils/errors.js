class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.businessCode = code || `HTTP_${status}`; }
}
// Express 4 不会自动捕获异步处理函数的错误。
const asyncHandler = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
function assert(condition, status, message, code) { if (!condition) throw new HttpError(status, message, code); }
module.exports = { HttpError, asyncHandler, assert };
