# Mini-12306 全栈购票演示系统

Mini-12306 使用原生 HTML/CSS/JavaScript 前端和 Node.js + Express + MongoDB 后端。保留原有蓝色、圆角卡片、375px 移动优先布局，支持旅客、售票员和管理员三种角色。数据库统一保存用户、车次、每日库存、订单、常用乘车人、支付及退款记录。

## 1. 环境准备

- Node.js 20 或更高版本（实验环境为 24.18.0），npm。
- Docker Desktop（启动后需支持 Docker Compose）。
- 首次安装依赖需要网络；集成测试首次运行会下载 MongoDB 7.0.14 测试程序，Windows 压缩包约 592 MB，之后使用本地缓存。

在项目根目录执行：

```powershell
cd D:\Workspace\mini12306
npm install
```

本次开发已创建 `server/.env` 并生成随机 JWT 密钥，该文件被 Git 忽略。在新电脑上先复制配置模板：

```powershell
Copy-Item server/.env.example server/.env
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

将生成的随机值填入 `server/.env` 的 `JWT_SECRET`。不要使用模板占位值。其他配置示例：

```dotenv
PORT=3000
MONGO_URI=mongodb://127.0.0.1:27017/mini12306?replicaSet=rs0&directConnection=true
JWT_SECRET=填写你生成的随机密钥
JWT_EXPIRES_IN=8h
CORS_ORIGIN=http://localhost:5500,http://127.0.0.1:5500
```

## 2. 本机启动：Mongo → 种子资料 → API → 测试

在根目录按顺序执行：

```powershell
docker compose up -d mongo
docker compose ps
npm run seed
npm run dev
```

Mongo 的健康检查会自动初始化单节点 `rs0` 副本集。等 `docker compose ps` 显示 mongo 为 **healthy** 后再运行 seed。副本集是 Mongo 多文档事务的前提；实现使用 Mongoose 的事务函数，将扣库存与建订单、退款与释放库存作为同一个事务提交。[MongoDB 事务文档](https://www.mongodb.com/docs/manual/core/transactions/)，[Mongoose 事务文档](https://mongoosejs.com/docs/8.x/docs/transactions.html)。

打开：<http://localhost:3000/pages/login.html>。API 同时提供前端页面，因此不必额外启动 Live Server。若使用 Live Server 的 `http://localhost:5500` 或 `http://127.0.0.1:5500`，前端会自动访问 `http://localhost:3000/api`。

另开一个终端运行：

```powershell
npm run test
```

测试使用 Node 内置 `node:test`。当前 `npm run test` 共 77 项、2026-10-28 实测全部通过：其中 28 项不连接数据库的单元与边界测试，49 项使用真实临时 Mongo 副本集的 API/集成测试；测试数据库与开发数据库隔离，无需先启动 Docker。也可仅运行 `npm run test:integration`。

`npm run seed` 将 `js/mock-data.js` 的资料导入 Mongo：4 个账号、8 条车次、常用乘车人、示例订单及支付记录。密码统一用 bcrypt 10 轮生成哈希。重复运行只补充缺失记录，不覆盖已有密码、订单或库存。旧浏览器 LocalStorage 业务数据不会迁入服务器。

## 3. Docker 一键启动

填写 `server/.env` 后：

```powershell
docker compose up -d --build
docker compose exec api npm run seed
```

同样访问 <http://localhost:3000/pages/login.html>。容器使用 Node.js 20；Compose 会覆盖容器内的 Mongo 地址为 `mongo:27017`，本机配置继续使用 `127.0.0.1`。

```powershell
docker compose logs -f api
docker compose stop
```

Mongo 数据保存在 `mongo-data` 卷中。日常停机使用 `stop` 或 `down`；不要加 `-v`，该参数会删除数据库卷。该 Compose 配置是本机开发环境，Mongo 和 API 端口只绑定本机，不直接用于公网部署。

## 4. 测试账号与角色

密码均为 `123456`，仅供虚构数据演示。

| 手机号 | 角色 | 登录后页面 |
| --- | --- | --- |
| 13800008001 | 旅客（USER-001） | 购票首页 |
| 13800008004 | 旅客（USER-004） | 购票首页 |
| 13800008002 | 售票员 | 售票工作台 |
| 13800008003 | 管理员 | 管理工作台 |

旅客可注册、查询车次、维护常用乘车人、选乘车人/席别、下单、模拟支付、查看个人订单、取消未支付订单、退票与改签；登录后可修改密码、退出登录，并通过公开的演示身份核验入口重置旅客密码。售票员可按线路查车，为已有旅客的用户编号办理柜台模拟出票。管理员可查看全部订单、按北京时间自然日查看经营统计、维护车次、创建账号和修改其他用户角色。

注册入口只创建旅客；不允许自行注册售票员和管理员，演示找回密码入口也只对旅客账号生效。管理员修改用户角色后，旧 JWT 会失效，用户需要重新登录；修改密码同样会撤销除当前会话以外的全部会话。列表及会话接口只返回脱敏姓名、手机号和证件号，绝不输出密码哈希。常用乘车人的原始姓名与证件号仅保存在数据库中供核验使用，所有出参一律脱敏。

## 5. 目录与职责

```text
mini12306/
├─ index.html                 旅客购票首页
├─ css/                       公共、页面、管理端及本轮扩展样式
├─ js/
│  ├─ api.js                  fetch、JWT、401、活动心跳、服务端登出
│  ├─ role-guard.js           服务端角色检查、角色导航、找回密码公开入口
│  ├─ storage.js              仅封装会话及查询条件缓存
│  ├─ mock-data.js            仅供后端 seed 使用，页面不加载
│  ├─ login.js / register.js  API 登录和旅客注册
│  ├─ home.js / train-list.js 查询、筛选、排序
│  ├─ booking.js              下单、支付、退款预览、跨城改签
│  ├─ orders.js / profile.js  订单分页筛选和个人资料
│  ├─ passengers.js           常用乘车人增删改（出参脱敏）
│  ├─ account-security.js     修改密码、退出登录、演示找回密码
│  ├─ admin-stats.js          管理端统计卡片与原生 DOM 柱图
│  ├─ management.js           管理端与售票员界面
│  └─ utils.js                格式化、Toast 等工具
├─ pages/
│  ├─ *.html                 旅客页面及公开登录/注册页
│  ├─ passengers.html        常用乘车人管理
│  ├─ change-password.html / forgot-password.html  改密与演示找回
│  ├─ clerk/dashboard.html   售票员工作台
│  └─ admin/
│     ├─ dashboard.html      管理首页、经营统计和全部订单
│     ├─ trains.html         车次列表管理
│     ├─ train-form.html     动态席别、运营日期 tag 编辑
│     └─ users.html          用户创建及角色修改
├─ server/
│  ├─ .env.example           环境变量示例
│  ├─ Dockerfile             Node.js 20 API 镜像
│  ├─ src/
│  │  ├─ index.js / app.js    启动、静态前端、错误处理
│  │  ├─ config.js           环境变量读取
│  │  ├─ seed.js             虚构数据导入
│  │  ├─ models/             Mongoose 数据模型与索引
│  │  ├─ routes/             路由及角色保护
│  │  ├─ controllers/        认证、查询、订单、乘车人、账号安全、统计和管理逻辑
│  │  ├─ middlewares/        JWT、角色和错误处理中间件
│  │  └─ utils/              校验、脱敏、事务、站点缓存、退款策略、分座、订单分页
│  └─ test/                  单元、边界与真实副本集的 API 集成测试
├─ docker-compose.yml        Mongo 单节点副本集 + API
├─ package.json              根目录统一运行命令
└─ package-lock.json         固定依赖安装版本
```

## 6. 主要接口

公开接口：`POST /api/auth/register`、`POST /api/auth/login`、`POST /api/auth/reset-password`（演示身份核验，只接受旅客账号）。

| 角色 | 方法与路径 | 功能 |
| --- | --- | --- |
| 所有登录角色 | GET /api/auth/me | 当前用户脱敏资料 |
| 所有登录角色 | POST /api/auth/activity | 用户操作活动报告 |
| 所有登录角色 | POST /api/auth/change-password | 校验旧密码改密，撤销除当前会话外的全部会话 |
| 所有登录角色 | POST /api/auth/logout | 服务端删除当前会话 |
| 所有登录角色 | GET /api/trains?from=&to=&date= | 读取指定日期实际库存 |
| 所有登录角色 | GET /api/trains/stations | 可用城市/车站 |
| 旅客 | GET /api/passengers | 本人的常用乘车人（脱敏） |
| 旅客 | POST /api/passengers | 新增常用乘车人 |
| 旅客 | PUT/DELETE /api/passengers/:id | 修改或删除本人乘车人 |
| 旅客 | GET /api/orders | 本人订单（服务端强制隔离，支持分页筛选） |
| 旅客 | GET /api/orders/:id | 本人订单详情 |
| 旅客 | GET /api/orders/:id/refund-quote | 服务器计算的退款预览 |
| 旅客 | POST /api/orders | 事务下单 |
| 旅客 | POST /api/orders/:id/pay | 模拟支付并分配座位 |
| 旅客 | POST /api/orders/:id/refund | 模拟退票，释放库存 |
| 旅客 | POST /api/orders/:id/cancel | 取消待支付订单 |
| 旅客 | POST /api/orders/:id/reschedule | 原子改签与模拟差额处理 |
| 管理员 | GET /api/orders/all | 全部订单（支持分页筛选） |
| 管理员 | GET /api/admin/stats?date= | 按北京时间自然日的只读经营统计 |
| 管理员 | GET/POST /api/admin/trains | 列表/新增车次 |
| 管理员 | GET/PUT/DELETE /api/admin/trains/:id | 详情/修改/删除 |
| 管理员 | GET/POST /api/admin/users | 用户列表/创建账号 |
| 管理员 | PATCH /api/admin/users/:id/role | 修改角色 |
| 售票员 | POST /api/clerk/orders/issue | 为已有旅客模拟出票 |

下单请求包含 `trainId`、`departureDate`、`seatType`、`requestId`，可选本人 `passengerId`。`requestId` 由前端生成，网络重试复用相同值，后端避免重复建单。柜台出票另传 `userId`。支付传 `method`，退款可传 `reason`。

`GET /api/orders` 与 `GET /api/orders/all` 支持 `status`（枚举值可逗号分隔多值）、`page`（默认 1）、`limit`（默认 20、上限 100）、`keyword`（按订单号或车次号模糊，输入已转义）。响应在保留原有 `orders` 数组的同时返回 `total`、`page`、`limit`、`hasMore`。

业务错误统一为 `{error:{code,message}}`，`message` 保持原有中文提示；新增的稳定 `code` 包括 `OLD_PASSWORD_WRONG`、`IDENTITY_MISMATCH`、`ACCOUNT_LOCKED`、`REFUND_DEPARTED`、`ALREADY_RESCHEDULED`、`PASSENGER_LIMIT`、`SEAT_UNAVAILABLE` 和 `DUPLICATE`。

## 7. 业务约束与测试范围

- 密码只存 bcrypt 哈希，盐轮数 10；第三次失败锁定 5 分钟，解锁由后端判定。
- JWT 含角色、认证版本与独立会话编号，后端核对当前角色、版本和会话；每次登录分别计算 30 分钟空闲时间。纯轮询不延长空闲期，重新登录不会恢复已过期的旧令牌，角色变更会永久撤销此前版本的令牌。
- 库存以车次、日期和席别独立保存；下单扣一张并建立待支付订单，同一事务失败时全部回滚。
- 待支付有效期 15 分钟；支付超时、主动取消和定时清理释放库存。重复支付、退票和改签不重复操作。
- 已有关联订单的车次不能修改车次号、出发站、到达站，不能删除，只能调整票价、余票、运营日期和售票开关。保留原席别以便历史订单退款。
- 管理员填写的余票是每个运营日的可售余票绝对值；编辑席别会覆盖各日可售库存，界面提交前明确提示。
- 退票手续费按距发车时间阶梯计算，全部由后端 `server/src/utils/refund-policy.js` 判定：超过 8 天免收，48 小时至 8 天收 5%，24 至不足 48 小时收 10%，不足 24 小时收 20%，发车时及以后拒绝退票。金额按分四舍五入，最低 0 元，前端只展示服务器给出的费率与退款额。
- 改签允许更换出发地、到达地、日期和席别。原票释放库存、新票扣库存、分配座位与差额流水在同一事务内完成，任一失败整体回滚；改签后的原订单再操作返回 `ALREADY_RESCHEDULED`，需在新订单上继续操作。
- 支付成功与柜台出票在事务内分配座位号（演示编号，最多 100 车 × 100 座），同一订单重复支付座位不变；同一车次日期席别下通过车次写锁和已支付座位查重避免冲突。历史订单没有座位字段时界面显示"待分配"。
- 常用乘车人每位旅客最多 20 条，同一用户下重复证件号被拒绝；新增、修改、删除在同一用户文档的写版本上串行化。删除乘车人不影响历史订单，订单保存的是脱敏身份快照。
- 修改密码校验旧密码并递增 `authVersion`，同时删除除当前会话外的全部会话；找回密码入口凭账号、手机号、证件号三要素核验，连续 5 次失败锁定 15 分钟，复用登录已有的失败计数字段（因此登录与找回的失败次数相互影响）。
- 取消与超时清理会记录 `cancelReason`（`user` 或 `timeout`）和 `cancelledAt` 供只读统计使用；历史取消单据不猜测回填原因。
- 管理端 `GET /api/admin/stats` 为只读聚合，不开事务：日期区间按北京时间自然日 `[00:00, 次日 00:00)`，`paidAmount`/`refundAmount` 取当日成功流水合计（含改签补款与退差），Top5 销量是当日创建且当前状态为 `paid` 的车票，不是全部历史售出，也不构成多查询一致的财务对账快照。
- 测试覆盖锁定/解锁、库存日期隔离、并发防超卖、重复请求、关联车次限制、角色越权、订单隔离、重复退款、空闲会话、角色变更、柜台出票、改签回滚、支付超时及敏感字段脱敏；本轮另覆盖乘车人增删改与越权、座位分配与并发不冲突、分页与关键词隔离、五个费率边界及发车拒退、跨城改签回滚与差额唯一、改密/登出/找回的令牌失效、统计聚合口径与角色限制。

支付、短信及身份核验仍为演示功能；注册不会发送真实短信，也不会把填写身份证等同于实名认证。正式运营需另行接入服务并设计部署、审计、限流、HTTPS 等生产能力。

## 8. 常见问题

- `docker` 找不到：安装并启动 Docker Desktop 后重新打开终端。
- `seed` 连接失败：检查 Mongo 是否 healthy，以及 `.env` 是否有 `replicaSet=rs0` 和本机 `directConnection=true`。
- JWT 配置报错：替换 `.env` 占位密钥，长度至少 32 字符。
- 测试首次下载较慢：Mongo 二进制会缓存到项目 `.cache/mongodb`，不要删除该缓存即可避免重复下载。
- 不要再双击 HTML 以 `file://` 运行，使用 API 提供的页面或允许跨域的 Live Server 地址。

## 9. 2026-10-15 P1 修复与升级

- 修复低价改签后无法退票的问题：退款记录按 `orderId + eventType` 唯一，区分 `reschedule_difference`（改签退差）和 `ticket_refund`（退票）。两种退款分别防重复，重复退票不会多退款或多释放库存。
- 新增 `sessions` 集合，每个登录令牌关联独立会话。只有尚未过期的会话可以更新活动时间；另一次登录不会刷新旧会话。
- 用户新增 `authVersion`，管理员调整角色时递增；旧令牌在角色恢复后仍然失效。
- 正常启动 API 或运行 seed 时，会自动补充旧退款流水的事件类型，建立新的联合唯一索引，再移除旧的 `orderId` 单字段唯一索引。不会清空数据库或删除历史流水。升级时先停止旧版 API，再启动新版，避免新旧版本同时使用不同退款模型。
- 升级前签发的旧格式令牌会失效，所有用户需重新登录一次；不需要重新创建账号或清空数据库。
- 该轮 `npm run test` 共 47 项并全部通过：实验二阶段为 35 项；第二轮新增 9 项缓存/清理单测和 3 项集成验证。本次仍在本机 Node.js 24＋临时 Mongo 副本集验证，未验证 Node.js 20 容器启动。总数现已增至 77 项，见第 11 节。

## 10. 2026-10-25 第二轮补充优化

- 站点接口 `GET /api/trains/stations` 增加 5 分钟进程内缓存；管理员新增、修改、删除车次的事务提交后立即失效缓存。
- `orders` 增加 `{status: 1, expiresAt: 1}` 查询索引；它不是 TTL 删除索引，过期订单仍由清理任务和事务取消并释放库存。
- `expireOrders` 增加进程内 single-flight，同一时刻的调用共享一轮扫描和事务处理。
- 缓存和 single-flight 仅在单个进程内有效；多实例没有共享缓存或分布式锁，数据库条件更新和事务仍是最终一致性保护。
- 第二轮使用独立数据库 `mini12306_perf_round2` 和 27019 端口测量，数据不能与实验二的 343.8 → 424.0 req/s 相加。方法与结果见 [第二轮性能测量.md](experiments/第二轮性能测量.md)，验证记录见 [第二轮优化验证.md](experiments/第二轮优化验证.md)。

## 11. 2026-10-28 七阶段功能补全

按课程实验之外的功能完整性做的七个阶段：常用乘车人增删改、车票座位号、订单分页与状态筛选、阶梯退票手续费、跨城改签、账号安全闭环（改密/登出/演示找回）、管理端经营统计。逐阶段实现、逐阶段全量回归，完整记录见 [七阶段功能补全交付报告.md](experiments/七阶段功能补全交付报告.md)。

- `npm run test` 现为 77 项全部通过：47 项沿用前两轮，本轮新增 30 项（23 项真实临时副本集的 API/事务测试 + 7 项费率边界单元测试）。本轮只测功能，未重跑 autocannon 或 Clinic，实验二的数字与结论保持原样。
- 数据模型新增可选字段和两条索引：`passengers` 的 `{ownerUserId, idType, idNumber}` 唯一索引（带 `partialFilterExpression`，旧脱敏记录不受影响），`orders` 的 `{trainId, departureDate, seatType, status}`（支撑已支付座位查重）。既有 `userId/status`、`status/expiresAt` 和全部唯一索引均未删除。正常启动会通过模型 `init` 建索引，不清库、不删历史流水；若部署环境关闭 `autoIndex`，需在维护窗口用 mongosh 手工创建这两条。
- 对外行为变化只有三处，其余均为新增接口或响应新增字段：退票手续费由固定 5% 改为阶梯；改签不再限制相同出发/到达城市；对已改签的原订单重复操作改为返回 `409 / ALREADY_RESCHEDULED`（此前会直接返回既有新订单）。既有 5% 金额断言所依赖的示例购票日期从"未来一/两天"调整为"未来三/四天"，使旧用例落在新规则的 5% 区间内，断言本身未删未放宽。
- 仍未实现：候补购票、真实短信/邮件与实名核验、公网限流与 HTTPS 部署、跨实例共享缓存与分布式锁。乘车人原始姓名与证件号按演示需要明文入库、仅在出参脱敏，生产使用需另行加密与审计。

