const path = require('node:path');
const { createSecretKey } = require('node:crypto');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// 密钥不能使用默认值启动，防止误部署一个可预测的签名密钥。
function loadConfig() {
  const { MONGO_URI, JWT_SECRET } = process.env;
  if (!MONGO_URI || !JWT_SECRET || JWT_SECRET.length < 32 || JWT_SECRET.startsWith('replace-')) {
    throw new Error('请填写 server/.env：MONGO_URI 和至少 32 字符的随机 JWT_SECRET');
  }
  // 先转成 KeyObject；否则 jsonwebtoken 每次验签都会尝试 createPublicKey 再回退到 HMAC 密钥。
  return { mongoUri: MONGO_URI, jwtSecret: createSecretKey(Buffer.from(JWT_SECRET)), jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h', port: Number(process.env.PORT || 3000), origins: (process.env.CORS_ORIGIN || 'http://localhost:5500').split(',').map(x => x.trim()) };
}
module.exports = { loadConfig };
