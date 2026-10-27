function errorHandler(error, req, res, next) {
  let status = error.status || 500;
  let message = error.message;
  if (error.code === 11000) { status = 409; message = '账号、手机号、车次号或订单编号已存在'; }
  if (error.name === 'ValidationError' || error.name === 'CastError' || error.type === 'entity.parse.failed') { status = 400; message = '提交的数据格式不正确'; }
  if (status >= 500) { console.error(error.stack); message = '服务暂时不可用，请稍后重试'; }
  res.status(status).json({error: {message}});
}
module.exports = { errorHandler };
