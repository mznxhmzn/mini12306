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

测试使用 Node 内置 `node:test`。当前 `npm run test` 共 47 项：4 项纯单元测试，以及使用真实临时 Mongo 副本集的 API/集成测试；测试数据库与开发数据库隔离，无需先启动 Docker。也可仅运行 `npm run test:integration`。

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

旅客可注册、查询车次、选乘车人/席别、下单、模拟支付、查看个人订单、取消未支付订单、退票与改签。售票员可按线路查车，为已有旅客的用户编号办理柜台模拟出票。管理员可查看全部订单、维护车次、创建账号和修改其他用户角色。

注册入口只创建旅客；不允许自行注册售票员和管理员。管理员修改用户角色后，旧 JWT 会失效，用户需要重新登录。列表及会话接口只返回脱敏姓名、手机号和证件号，绝不输出密码哈希。

## 5. 目录与职责

```text
mini12306/
├─ index.html                 旅客购票首页
├─ css/                       公共、页面和管理端样式
├─ js/
│  ├─ api.js                  fetch、JWT、401、活动心跳
│  ├─ role-guard.js           服务端角色检查、角色导航
│  ├─ storage.js              仅封装会话及查询条件缓存
│  ├─ mock-data.js            仅供后端 seed 使用，页面不加载
│  ├─ login.js / register.js  API 登录和旅客注册
│  ├─ home.js / train-list.js 查询、筛选、排序
│  ├─ booking.js              下单、支付、退款、改签
│  ├─ orders.js / profile.js  个人订单和资料
│  ├─ management.js           管理端与售票员界面
│  └─ utils.js                格式化、Toast 等工具
├─ pages/
│  ├─ *.html                 旅客页面及公开登录/注册页
│  ├─ clerk/dashboard.html   售票员工作台
│  └─ admin/
│     ├─ dashboard.html      管理首页和全部订单
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
│  │  ├─ controllers/        认证、查询、订单和管理逻辑
│  │  ├─ middlewares/        JWT、角色和错误处理中间件
│  │  └─ utils/              校验、脱敏、事务业务工具
│  └─ test/                  单元测试与 API 集成测试
├─ docker-compose.yml        Mongo 单节点副本集 + API
├─ package.json              根目录统一运行命令
└─ package-lock.json         固定依赖安装版本
```

## 6. 主要接口

公开接口：`POST /api/auth/register`、`POST /api/auth/login`。

| 角色 | 方法与路径 | 功能 |
| --- | --- | --- |
| 所有登录角色 | GET /api/auth/me | 当前用户脱敏资料 |
| 所有登录角色 | POST /api/auth/activity | 用户操作活动报告 |
| 所有登录角色 | GET /api/trains?from=&to=&date= | 读取指定日期实际库存 |
| 所有登录角色 | GET /api/trains/stations | 可用城市/车站 |
| 旅客 | GET /api/passengers | 本人的常用乘车人 |
| 旅客 | GET /api/orders | 本人订单（服务端强制隔离） |
| 旅客 | GET /api/orders/:id | 本人订单详情 |
| 旅客 | POST /api/orders | 事务下单 |
| 旅客 | POST /api/orders/:id/pay | 模拟支付 |
| 旅客 | POST /api/orders/:id/refund | 模拟退票，释放库存 |
| 旅客 | POST /api/orders/:id/cancel | 取消待支付订单 |
| 旅客 | POST /api/orders/:id/reschedule | 原子改签与模拟差额处理 |
| 管理员 | GET /api/orders/all | 全部订单 |
| 管理员 | GET/POST /api/admin/trains | 列表/新增车次 |
| 管理员 | GET/PUT/DELETE /api/admin/trains/:id | 详情/修改/删除 |
| 管理员 | GET/POST /api/admin/users | 用户列表/创建账号 |
| 管理员 | PATCH /api/admin/users/:id/role | 修改角色 |
| 售票员 | POST /api/clerk/orders/issue | 为已有旅客模拟出票 |

下单请求包含 `trainId`、`departureDate`、`seatType`、`requestId`，可选本人 `passengerId`。`requestId` 由前端生成，网络重试复用相同值，后端避免重复建单。柜台出票另传 `userId`。支付传 `method`，退款可传 `reason`。

## 7. 业务约束与测试范围

- 密码只存 bcrypt 哈希，盐轮数 10；第三次失败锁定 5 分钟，解锁由后端判定。
- JWT 含角色、认证版本与独立会话编号，后端核对当前角色、版本和会话；每次登录分别计算 30 分钟空闲时间。纯轮询不延长空闲期，重新登录不会恢复已过期的旧令牌，角色变更会永久撤销此前版本的令牌。
- 库存以车次、日期和席别独立保存；下单扣一张并建立待支付订单，同一事务失败时全部回滚。
- 待支付有效期 15 分钟；支付超时、主动取消和定时清理释放库存。重复支付、退票和改签不重复操作。
- 已有关联订单的车次不能修改车次号、出发站、到达站，不能删除，只能调整票价、余票、运营日期和售票开关。保留原席别以便历史订单退款。
- 管理员填写的余票是每个运营日的可售余票绝对值；编辑席别会覆盖各日可售库存，界面提交前明确提示。
- 退票手续费采用演示规则 5%；改签仅允许相同出发/到达城市，差价为模拟补款或退款。
- 测试覆盖锁定/解锁、库存日期隔离、并发防超卖、重复请求、关联车次限制、角色越权、订单隔离、重复退款、空闲会话、角色变更、柜台出票、改签回滚、支付超时及敏感字段脱敏。

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
- `npm run test` 当前共 47 项并全部通过：实验二阶段为 35 项；第二轮新增 9 项缓存/清理单测和 3 项集成验证。本次仍在本机 Node.js 24＋临时 Mongo 副本集验证，未验证 Node.js 20 容器启动。

## 10. 2026-10-25 第二轮补充优化

- 站点接口 `GET /api/trains/stations` 增加 5 分钟进程内缓存；管理员新增、修改、删除车次的事务提交后立即失效缓存。
- `orders` 增加 `{status: 1, expiresAt: 1}` 查询索引；它不是 TTL 删除索引，过期订单仍由清理任务和事务取消并释放库存。
- `expireOrders` 增加进程内 single-flight，同一时刻的调用共享一轮扫描和事务处理。
- 缓存和 single-flight 仅在单个进程内有效；多实例没有共享缓存或分布式锁，数据库条件更新和事务仍是最终一致性保护。
- 第二轮使用独立数据库 `mini12306_perf_round2` 和 27019 端口测量，数据不能与实验二的 343.8 → 424.0 req/s 相加。方法与结果见 [第二轮性能测量.md](experiments/第二轮性能测量.md)，验证记录见 [第二轮优化验证.md](experiments/第二轮优化验证.md)。

