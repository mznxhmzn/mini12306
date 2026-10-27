const express = require('express');
const cors = require('cors');
const path = require('node:path');
const { routes } = require('./routes');
const { errorHandler } = require('./middlewares/error');
const { HttpError } = require('./utils/errors');
function createApp(config) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors((req, callback) => {
    const origin = req.get('Origin');
    // API 同时提供网页时，浏览器的同源 POST 也会携带 Origin。
    const sameOrigin = origin === `${req.protocol}://${req.get('host')}`;
    if (!origin || sameOrigin || config.origins.includes(origin)) callback(null, {origin: true});
    else callback(new HttpError(403, '不允许的来源'));
  }));
  app.use(express.json({limit: '100kb'}));
  app.get('/api/health', (req, res) => res.json({ok: true}));
  app.use('/api', routes(config));
  app.use('/api', (req, res, next) => next(new HttpError(404, '接口不存在')));
  // 只开放前端文件目录，绝不直接暴露项目根目录中的 .env 或 server。
  const root = path.resolve(__dirname, '../..');
  for (const folder of ['css', 'js', 'pages']) app.use(`/${folder}`, express.static(path.join(root, folder), {dotfiles: 'deny'}));
  app.get(['/', '/index.html'], (req, res) => res.sendFile(path.join(root, 'index.html')));
  app.use(errorHandler);
  return app;
}
module.exports = { createApp };
