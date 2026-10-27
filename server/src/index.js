const mongoose = require('mongoose');
const { loadConfig } = require('./config');
const { createApp } = require('./app');
const { expireOrders } = require('./utils/order-service');
async function start() {
  const config = loadConfig();
  await mongoose.connect(config.mongoUri);
  await require('./utils/initialize-models').initializeModels();
  const server = createApp(config).listen(config.port, () => console.log(`Mini-12306: http://localhost:${config.port}/pages/login.html`));
  let running = false;
  const timer = setInterval(async () => { if (running) return; running = true; try { await expireOrders(); } catch (error) { console.error('过期订单处理失败', error.message); } finally { running = false; } }, 30000);
  async function stop() { clearInterval(timer); server.close(async () => { await mongoose.disconnect(); process.exit(0); }); }
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
start().catch(error => { console.error(error.message); process.exit(1); });
