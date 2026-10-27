# Mini-12306 实验：与 LLM 的交互过程记录

- **项目**：`D:\Workspace\mini12306`
- **日期**：2026-10-21（初版）；2026-10-22（Docker 重跑并更新）
- **参与者**：用户（项目作者）、LLM（Qoder）
- **关联交付物**：[实验报告](实验报告.md)

> 本记录按时间顺序整理用户指令、LLM 的关键动作、命令与输出摘要，以及遇到的问题和处理方式。命令输出有删减；原始数据保存在 `experiments/` 目录。记录不包含 `server/.env` 中的任何密钥。

---

## 1. 用户原始需求

用户给出项目路径后提出：

> 两个小实验：
> （1）静态代码审查：选择 2-3 个静态代码审查工具，“截图 + 文字”的方式给出各个工具的审查结果。（无需修改代码）
> （2）性能优化：选择一个性能优化工具对代码进行分析，给出优化前后性能分析结果、优化前后代码对比、具体性能指标的优化等。
> 注意：提交实验报告，以及与 LLM 交互过程。

项目协作规范（`claude.md`）要求：用户是计算机初学者；涉及技术选择时用中文说明 2～3 个方案、优缺点和推荐理由；低风险实现细节可按常见做法推进并汇报。

本次需求已经明确指定了实验目标和交付物，属于实验性、可回退的本地修改，因此 LLM 在说明选型后直接推进；没有执行 `git commit`、`git push` 等共享操作。

---

## 2. 需求拆解与方案选择

| 子任务 | 交付物 | 方案 |
| --- | --- | --- |
| 实验一 | 2–3 个工具的截图 + 文字结论 | ESLint + eslint-plugin-security、Semgrep、npm audit |
| 实验二 | 优化前后性能结果、代码对比、指标 | Clinic Flame 定位热点 + autocannon 压测 + MongoDB profiler 看执行计划 |
| 文档 | 实验报告、LLM 交互过程 | `experiments/实验报告.md`、`experiments/LLM交互记录.md` |

### 2.1 静态审查工具的选择

LLM 先检查了本机环境，发现：

- Windows 11，初始阶段没有 Docker（2026-10-22 已安装 Docker Desktop 29.9.2，用于重跑性能实验）；
- Node.js 24.18.0、npm 11.16.0、Python 3.13、Java 25；
- 只有 Microsoft Edge，没有 Chrome。

据此比较了三种方案：

1. **SonarQube**：功能全，但需要 Docker/服务端，Windows 本机部署成本高，不适合一次课程实验。
2. **ESLint + eslint-plugin-security + Semgrep + npm audit**：全部可本地运行；ESLint 负责规范与危险模式，Semgrep 负责语义安全规则，npm audit 负责依赖 CVE；三者互补，且都能输出可截图的结果。
3. **只跑 ESLint**：最省事，但覆盖不到跨行语义安全模式和依赖漏洞，不足以支撑“2–3 个工具”的要求。

推荐并采用方案 2。用户没有提出异议，实验继续。

### 2.2 性能工具的选择

- **Clinic.js**：能生成 CPU 火焰图，直观看到 `createPublicKey`、mongoose、express 等调用链；适合“选择一个性能优化工具对代码进行分析”的要求。
- **autocannon**：负责可重复的吞吐/延迟测量，避免只凭火焰图“感觉”优化。
- **MongoDB profiler**：负责执行计划（COLLSCAN/IXSCAN）、扫描文档数、索引键数等硬指标。

Clinic Doctor 在 Node 24 上不可用（后文详述），最终使用 **Clinic Flame**。

---

## 3. 实验一执行过程

### 3.1 安装工具与 ESLint 配置

在 `experiments/tools` 建立独立工具目录，安装：

- `eslint@8.57.1`
- `eslint-plugin-security@3.0.1`
- `htmlhint@1.9.2`（辅助，不纳入正式三工具结论）
- `clinic@13.0.0`
- `autocannon@8.x`
- `puppeteer-core@24.x`（调用本机 Edge 截图）

**遇到的问题：ESLint 依赖冲突**

最初还想安装 `eslint-plugin-no-unsanitized@4` 来补充 XSS 检查，但 npm 报 `ERESOLVE`：

```text
eslint-plugin-no-unsanitized@4 requires eslint@9, but eslint@8.57.1 is installed
```

**处理**：放弃该插件，保留 ESLint 8.57.1；XSS 检查由 Semgrep 的 `raw-html-concat` 规则覆盖。没有为了一个插件把整个工具链升级到 ESLint 9，避免影响既有配置。

创建了两份配置：

- [eslint-browser.json](static/eslint-browser.json)：浏览器环境、ES2022、`eslint:recommended` + security 插件；
- [eslint-server.json](static/eslint-server.json)：Node 环境，其余规则相同。

### 3.2 ESLint 执行

前端结果：

```text
✖ 24 problems (15 errors, 9 warnings)
```

- 6 个文件有问题：`booking.js`、`management.js`、`orders.js`、`home.js`、`role-guard.js`、`utils.js`。
- error 集中在 `no-irregular-whitespace`（12 个）和 `no-inner-declarations`（3 个）。
- warning 包括 7 个 `security/detect-object-injection` 和 2 个 `no-unused-vars`。

后端结果：

```text
✖ 15 problems (0 errors, 15 warnings)
```

- 11 个对象注入 warning 在 `validation.js`；
- 4 个未使用变量 warning 分别在 `seed.js`、`order-service.js`、`serialize.js`。

### 3.3 截图问题与修正

第一版截图只显示了文件标题行，展开后的具体告警没有出现。原因是 ESLint 的 HTML 报告用折叠行组织结果。

**处理**：在 Puppeteer 脚本中先执行：

```js
document.querySelectorAll('th').forEach(th => th.click());
```

把每个文件行展开，再截整页。最终得到完整截图：

- `experiments/assets/static-01-eslint-frontend.png`
- `experiments/assets/static-02-eslint-server.png`

### 3.4 Semgrep 执行与误报复核

使用规则集：

```bash
semgrep --config p/nodejs --config p/owasp-top-ten --json --output experiments/static/semgrep.json .
```

结果：

```text
Findings: 4 (4 blocking)
Rules run: 72
```

4 条都在 `js/booking.js` 的 24、48、53、57 行，规则为 `raw-html-concat`，提示“用户可控数据进入 HTML 字符串”。

**遇到的问题：报告代码片段显示“requires login”**

Semgrep JSON 的 `extra.lines` 在这次运行中返回的是登录提示，而不是源码行。**处理**：HTML 报告生成脚本改为直接读取源文件对应行，截取前 360 字符展示，避免依赖 Semgrep 的 `extra.lines`。

**人工复核**：

- `js/booking.js:10` 的 `escape()` 对 `& < > " '` 做实体编码；
- `routeCard()` 中所有订单字段都经过 `escape()`；
- 插值中的金额经过 `money()`（数值格式化）。

因此判定为**误报**，当前代码路径不构成可利用 XSS；但记录“未来新增字段容易漏转义”的维护风险。

### 3.5 npm audit 与 registry 问题

第一次执行 `npm audit` 失败，原因是本机 npm 默认使用 npmmirror，镜像不提供审计接口：

```text
404 Not Found - POST https://registry.npmmirror.com/-/npm/v1/security/advisories/bulk
```

**处理**：改用官方 registry 重跑：

```bash
npm audit --json --registry=https://registry.npmjs.org
```

结果：0 个漏洞，149 个依赖（109 生产、41 开发）。生成 `experiments/assets/static-04-npm-audit.png`。

### 3.6 实验一阶段结论

- 3 个工具的结果都已截图并整理为文字；
- 没有发现需要立即修复的高危问题；
- **未修改任何业务代码**；
- 建议的清理项留待后续单独提交，避免把“审查”和“修复”混在一次变更里。

---

## 4. 实验二执行过程

> 阶段说明：4.1–4.7 记录 2026-10-21 的非 Docker 早期轮次，相关数据已归档到 `perf/archive-pre-docker-2026-10-22/`；4.8 为 2026-10-22 使用 Docker 隔离 MongoDB 的重跑，最终报告与指标表均采用 4.8 的结果。

### 4.1 基线与数据准备

**约束**：初始阶段本机没有 Docker，不能直接用 MongoDB 容器。**处理**：使用 `mongodb-memory-server` 的 `MongoMemoryReplSet`，缓存 MongoDB 7.0.14 二进制，启动单节点副本集。

为避免污染开发数据：

- 数据库名固定包含 `mini12306_perf`；
- `seed-large.js` 会检查数据库名，不符合就拒绝清库；
- 测试服务器 `experiments/perf/server.js` 显式传入测试 JWT 密钥，不读取 `server/.env`。

**数据规模**：

```text
trains: 8000
inventories: 168000
users: 1
elapsedSeconds: 23.5
```

查询固定为 `武汉 → 北京，2026-10-25`，命中 3 趟车（G1001–G1003），便于每次得到相同结果。

**基线压测**（50 连接，3 轮 × 15 s）：

```text
run 1: 392.8 req/s, p50 122 ms, p99 247 ms
run 2: 432.5 req/s, p50 113 ms, p99 152 ms
run 3: 390.2 req/s, p50 119 ms, p99 241 ms
```

### 4.2 执行计划采集：explain 失败，改用 profiler

最初尝试用 MongoDB 的 `explain()` 获取执行计划，但驱动返回：

```text
BSONError: Invalid UTF-8 string in BSON document
```

即使用最简单的查询、直接调用 `db.command({explain...})` 也失败。**处理**：改用 **profiler level 2**：

1. 开启 `profile: 2`；
2. 执行查询；
3. 从 `system.profile` 读取 `planSummary`、`docsExamined`、`keysExamined`、`millis`；
4. 读取后关闭 profiler。

基线结果：

```text
planSummary: COLLSCAN
docsExamined: 8000
keysExamined: 0
nReturned: 3
millis: 3
```

这确认了车次查询确实在做全表扫描。

### 4.3 Clinic Flame：从 Doctor 切换到 Flame

最初尝试 Clinic Doctor，在 Node 24 上失败：

```text
No files matching the pattern found
```

问题来自 Doctor 依赖的 `node-trace-log-join` 与当前 Node 版本不兼容。**处理**：改用 **Clinic Flame**（v13.0.0），它能生成 CPU 火焰图，满足本次“找热点”的目标。

其他 Clinic 问题：

| 问题 | 现象 | 处理 |
| --- | --- | --- |
| 遥测确认 | 非交互终端里 Clinic 停在权限提示 | 设置 `NO_INSIGHT=1` |
| `--autocannon` 带认证头 | 打印 autocannon 用法，没有真正压测 | 改用 `--on-port "node experiments/perf/load-on-port.js"`，在脚本里用 autocannon 编程式压测 |
| `--on-port` 参数解析 | 直接跟 `node server.js` 时 Clinic 打印帮助 | 在目标命令前加 `--`，即 `... -- node experiments/perf/server.js` |

基线 Clinic（非 Docker 早期轮次，已归档）：

```text
426.7 req/s, p50 67 ms, p99 158 ms
hottest frame: createPublicKey (5.4%), 723 frames
```

火焰图截图：`experiments/assets/perf-01-clinic-baseline.png`。

### 4.4 第一轮优化

根据 profiler 和火焰图，确定三项改动：

1. 为 `trains` 增加 4 条复合索引（城市/车站的 2×2 组合，包含日期与可售标记）；
2. 把嵌套 `$and/$or` 改写为 4 个完整条件分支的 `$or`，让每个分支命中一条索引；
3. 把库存线性查找改成 `Map` 哈希查找。

改动后：

- 接口仍返回 3 趟车，余票 40/100/500；
- profiler：4 路 IXSCAN，`docsExamined` 3，`keysExamined` 6，`millis` 0–1；
- 压测归档：142.5 / 148.9 / 153.3 req/s，p50 345/327/322 ms。该轮已经处于机器 I/O 漂移状态，不能与漂移前的基线 392.8/432.5/390.2 req/s 直接比较（见 4.5）。

### 4.5 机器状态漂移与配对重测

第一轮优化后继续做 Clinic 复测，出现异常：

```text
Clinic optimized: 123.7 req/s
后续普通压测: 142–153 req/s
```

这与漂移前的基线 392.8–432.5 req/s 差距过大。LLM 做了以下排查：

1. `/api/health`（不查库、不验 JWT）：约 **2,280 req/s**，说明 Node/HTTP 本身正常；
2. MongoDB 单次 `ping`：从原来的 <1 ms 升到约 **6 ms**；
3. profiler 聚合：`trains` 查询平均 1.77 ms、`inventories` 0.09 ms、`sessions` 0.02 ms、`users` 0 ms，说明查询计划没有退化；
4. 检查端口、TIME_WAIT、CPU、Mongo 进程，未发现失控进程；
5. 结论：**整机 I/O 延迟在连续压测后上升**，不是优化代码造成的，但不能用这种状态下的“优化后 123.7”与“基线 426.7”对比。

**决策**：重新建一份全新数据库，在同一时段做配对 A/B：

1. 停止服务器和旧 Mongo fixture；
2. 重新启动 MongoMemoryReplSet，重新 seed 8,000/168,000；
3. 临时恢复基线代码（controller、models、config、perf server），压测 3 轮；
4. 恢复优化代码，建索引，压测 3 轮；
5. 两轮都使用同一个 `.token`、同一查询、同样 50 连接、3 s 预热 + 3×15 s。

配对基线（非 Docker 早期轮次）：

```text
246.5 / 255.7 / 257.5 req/s
p50 201 / 192 / 190 ms
p99 282 / 262 / 301 ms
```

配对优化后（非 Docker 早期轮次）：

```text
266.5 / 282.7 / 283.3 req/s
p50 183 / 175 / 170 ms
p99 306 / 230 / 326 ms
```

profiler（非 Docker 早期轮次，已归档）：

```text
基线:   COLLSCAN, docs 8000, keys 0,   9 ms
优化后: 4×IXSCAN, docs 3,    keys 6,   1 ms
```

早期结果已归档到 `experiments/perf/results/archive-early-run/`。该轮后续被 Docker 重跑取代，最终报告使用 4.8 的配对结果。

### 4.6 追加优化：JWT KeyObject

Clinic 火焰图里最热帧是 `createPublicKey`。查看 `jsonwebtoken@9.0.3` 的 `verify.js` 后确认：当密钥是字符串时，每次验签都会：

```js
try { secretOrPublicKey = createPublicKey(secretOrPublicKey); }
catch { secretOrPublicKey = createSecretKey(Buffer.from(secretOrPublicKey)); }
```

也就是说，每个请求都会先做一次注定失败的“公钥解析”。**处理**：在 `server/src/config.js` 里启动时一次性创建 `createSecretKey(...)`，让 `jwt.verify` 直接使用 `KeyObject`，跳过失败分支。

验证：

- 用字符串密钥签发的旧 token 仍可被 KeyObject 验证；
- 优化后的 Clinic 报告中 `createPublicKey` 出现次数为 **0**（Docker 重跑基线 HTML 中出现 20 次；早期非 Docker 基线为 14 次）；
- 35 个自动化测试全部通过。

### 4.7 测试与最终验证

```text
tests 35
pass 35
fail 0
```

覆盖下单事务、库存隔离、支付/退款/改签、权限、会话过期、JWT 失效、索引迁移等回归场景。

最终接口验证：

```text
HTTP 200
trains 3
G1001 seats:
  商务座 remaining 40
  一等座 remaining 100
  二等座 remaining 500
```

### 4.8 Docker 重跑（2026-10-22，最终口径）

用户安装 Docker 后，选择用隔离的 MongoDB 容器重跑性能实验。目标不是替换原有结论，而是在更可控的数据库环境中重新做一次基线/优化配对测量；旧结果先归档，再更新报告与文档。

**环境与隔离**：

```text
Docker Desktop 29.9.2，Linux 容器
镜像：mongo:7.0.14（官方）
容器：mini12306-perf-mongo
数据卷：mini12306-perf-mongo-data
端口：127.0.0.1:27017
副本集：rs0（单节点）
数据库：mini12306_perf
```

启动命令：

```bash
docker run -d --name mini12306-perf-mongo \
  -p 127.0.0.1:27017:27017 \
  -v mini12306-perf-mongo-data:/data/db \
  mongo:7.0.14 mongod --replSet rs0 --bind_ip_all
docker exec mini12306-perf-mongo mongosh --quiet \
  --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"127.0.0.1:27017"}]})'
# .mongo-uri:
# mongodb://127.0.0.1:27017/mini12306_perf?replicaSet=rs0
```

**过程中的两个 Docker 问题**：

1. 只调用 `docker.exe` 全路径时，报 `docker-credential-desktop: executable file not found in %PATH%`。把 `C:\Program Files\Docker\Docker\resources\bin` 加入 PATH 后恢复。
2. 首次拉取 `mongo:7.0.14` 时 `auth.docker.io` 返回 EOF；重试后成功，镜像摘要核对一致。

**数据与源码保护**：

- 旧结果（26 个 JSON、13 个日志、2 张旧 Clinic 截图）归档到 `experiments/perf/archive-pre-docker-2026-10-22/`；
- 当前优化代码备份到 `experiments/perf/backup-live-2026-10-22/`，记录三个文件的 SHA-256；
- 基线阶段临时恢复 `perf/before/` 的三个文件，优化阶段恢复 `perf/after/` 与索引；实验后校验文件哈希一致；
- `server.js` 改为按 `PERF_PHASE` 选择 JWT 字符串或 `KeyObject`，确保前后差异只来自待验证代码；
- 全程未读取 `server/.env`。

**复测命令**（项目根目录）：

```bash
node experiments/perf/seed-large.js
node experiments/perf/get-token.js

PERF_PHASE=baseline node experiments/perf/server.js
node experiments/perf/explain.js baseline
node experiments/perf/load.js baseline

PERF_PHASE=optimized node experiments/perf/server.js
node experiments/perf/explain.js optimized
node experiments/perf/load.js optimized

node experiments/perf/summarize.js
```

Clinic 使用同一份 Docker 数据库，基线/优化分别输出到 `clinic-before-docker/` 与 `clinic-after-docker/`。

**新压测结果**（50 连接，3 s 预热 + 3 轮 × 15 s）：

```text
基线:   306.5 / 369.5 / 355.4 req/s
        平均 343.8 req/s；平均延迟 145.62 ms；P50 133 ms；P99 254 ms
        2xx 15,471；非 2xx 0；错误 0

优化后: 400.8 / 418.6 / 452.6 req/s
        平均 424.0 req/s；平均延迟 117.72 ms；P50 114 ms；P99 196 ms
        2xx 19,080；非 2xx 0；错误 0
```

变化：吞吐 **+23.33%**，平均延迟 **-19.16%**，P50 **-14.29%**，P99 **-22.83%**。P99 单轮仍有波动，报告同时给出三轮原始值，不把单轮极值当作稳定结论。

**profiler**：

```text
基线:   COLLSCAN, docs 8000, keys 0, 3 ms（7 次 2/3/3/2/3/3/2）
优化后: 4×IXSCAN, docs 3, keys 6, 0 ms（7 次均为 0，低于 1 ms 计时精度）
```

**Clinic Flame**：

```text
基线:   325.4 req/s, P50 87 ms, P99 186 ms
        808 个节点；handleWriteReq 7.2%；createPublicKey 55 个采样（约 0.38%）
        HTML 中 createPublicKey 出现 20 次
优化后: 430.8 req/s, P50 66 ms, P99 159 ms
        749 个节点；handleWriteReq 5.2%；createPublicKey 0 次
```

**正确性**：接口仍返回 G1001–G1003 三趟车，余票 40/100/500；基线/优化共 15,471/19,080 个请求全部为 2xx；`npm --prefix server test` 35/35 通过。

**文档更新**：正式报告重新生成，共 24 页，成绩评定表完整位于第 24 页；`实验报告.md` 的环境、指标、复现命令与结论全部改为 Docker 口径；Clinic 截图替换为 `perf-01-clinic-baseline.png` / `perf-02-clinic-optimized.png` 的新版本。

---

## 5. 问题与处理汇总

| # | 问题 | 现象 | 处理 |
| ---: | --- | --- | --- |
| 1 | ESLint 插件依赖冲突 | `eslint-plugin-no-unsanitized@4` 要求 ESLint 9 | 移除该插件，XSS 交给 Semgrep |
| 2 | ESLint HTML 行折叠 | 截图只显示文件标题 | Puppeteer 点击所有 `th` 展开 |
| 3 | Semgrep `extra.lines` 异常 | 显示 “requires login” | 报告生成器直接读源码行 |
| 4 | npm audit 镜像 404 | npmmirror 不提供审计接口 | 改用官方 registry |
| 5 | MongoDB explain BSON 错误 | `Invalid UTF-8 string in BSON document` | 改用 profiler level 2 |
| 6 | Clinic 遥测提示阻塞 | 非交互终端停住 | `NO_INSIGHT=1` |
| 7 | Clinic Doctor 不兼容 Node 24 | `node-trace-log-join` 报错 | 改用 Clinic Flame |
| 8 | Clinic `--autocannon` 认证头 | 打印用法，未压测 | 改用 `--on-port` + 编程式 autocannon |
| 9 | Clinic `--on-port` 参数 | 打印帮助 | 目标命令前加 `--` |
| 10 | Puppeteer 打开 Clinic 报告超时 | `networkidle0` 30 s 超时 | Clinic 页面改用 `load` + 延长等待 |
| 11 | 连续压测后机器变慢 | 吞吐从 500+ 掉到 150–250 | 归档早期结果，改用 Docker 隔离 MongoDB，重新建库做配对 A/B |
| 12 | JWT 每次 `createPublicKey` | Flame 中该文本出现 20 次 | 启动时创建 `KeyObject`，优化后为 0 次 |
| 13 | Docker 凭据助手找不到 | `docker-credential-desktop` 不在 PATH | 把 Docker 的 `resources\bin` 加入 PATH |
| 14 | Docker Hub 拉取中断 | `auth.docker.io` 返回 EOF | 重试拉取，核对镜像摘要 |

---

## 6. 安全、范围与合规

1. **未读取或输出 `server/.env`**。性能测试使用显式的测试 JWT 密钥和独立数据库 `mini12306_perf`，避免接触真实凭据。
2. **数据库隔离**：`seed-large.js` 拒绝操作数据库名不含 `mini12306_perf` 的库，防止误清开发数据。
3. **没有执行 git 提交或推送**。项目原有大量未提交改动保持不变；本次只修改了 3 个业务文件并新增 `experiments/` 下的实验脚本与证据。
4. **实验一未改代码**；实验二按优化方案修改了：
   - `server/src/controllers/trains.js`
   - `server/src/models/index.js`
   - `server/src/config.js`
5. **测试通过**：35/35；接口返回结构和余票值与基线一致。

---

## 7. 结果整理与交付

- 正式报告（直接填写课程模板）：[实验报告书.docx](实验报告书.docx)，另有 [实验报告书.pdf](实验报告书.pdf) 供预览
- 详细技术底稿：[实验报告.md](实验报告.md)
- 指标汇总：`experiments/perf/results/summary.json`
- 压测原始数据：`experiments/perf/results/baseline*.json`、`optimized*.json`
- profiler 数据：`experiments/perf/results/explain-baseline.json`、`explain-optimized.json`
- 代码 diff：`experiments/perf/diff-trains.patch`、`diff-models.patch`、`diff-config.patch`
- 截图：`experiments/assets/static-01..04`、`perf-01/02`
- 早期非 Docker 结果：`experiments/perf/results/archive-early-run/`
- Docker 重跑前归档：`experiments/perf/archive-pre-docker-2026-10-22/`
- 优化代码备份与哈希：`experiments/perf/backup-live-2026-10-22/`

最终指标（Docker 配对口径）：

| 指标 | 基线 | 优化后 | 变化 |
| --- | ---: | ---: | ---: |
| 吞吐量 | 343.8 req/s | 424.0 req/s | +23.3% |
| 平均延迟 | 145.62 ms | 117.72 ms | -19.2% |
| P50 | 133 ms | 114 ms | -14.3% |
| P99 | 254 ms | 196 ms | -22.8%（单轮仍有波动） |
| 扫描文档数 | 8,000 | 3 | -99.96% |
| 查询时间 | 3 ms | 0 ms（<1 ms） | -100%（低于计时精度） |
| Clinic `createPublicKey` 出现次数 | 20 | 0 | 热点消除 |
| Clinic 吞吐（仅参考） | 325.4 req/s | 430.8 req/s | +32.4% |

---

## 8. 反思与后续

### 做得好的地方

- 先测量再改代码：profiler 确认 COLLSCAN，Clinic 确认 JWT 热点，autocannon 给出可重复的吞吐/延迟。
- 没有只盯一个指标：同时保留数据库层（扫描文档数、执行计划）和端到端（吞吐、延迟）两组数据。
- 发现机器状态漂移后，没有把异常数据硬写进报告，而是先归档早期结果，再用 Docker 隔离 MongoDB 重新建库做配对 A/B。
- 静态审查与性能优化分开说明，明确“实验一未改代码”。

### 可以改进的地方

- Docker 配对 A/B 仍是单机、单次会话；更严谨的做法是 A-B-A 交替多轮，或使用独立压测机。
- P99 受机器抖动影响大，后续可以增加轮次、报告中位数与置信区间。
- 鉴权链路仍有 `User.findById` + `Session.findOne` 两次数据库往返，是当前端到端的主要成本之一；若继续优化，可评估短 TTL 缓存或合并查询，但必须保证会话失效语义不变。
- 索引会增加写入成本；真实生产环境应结合车次写入频率、磁盘成本和慢查询日志持续评估。

---

## 9. 附：本次交互中用户可见的关键指令

1. 指定项目路径 `D:\Workspace\mini12306`。
2. 提出两个实验及“截图 + 文字”“优化前后对比”“实验报告 + LLM 交互过程”的交付要求。
3. 明确实验一“无需修改代码”。
4. 提供课程模板 `实验1-4,6-7的实验报告书模板(1).doc`，并要求性能优化部分必须给出源代码对比。

其余步骤由 LLM 在实验范围内推进，并在每个阶段用中文说明选择、结果和风险。

---

## 10. 按课程模板填写报告

### 模板转换

模板是旧版 `.doc`。为不改变版式，先用 Word COM `DispatchEx` 以只读方式打开，`SaveAs2(FileFormat=16)` 转为 `.docx`，再在转换后的模板上填写。模板的封面信息表、三部分标题、外框表格与成绩评定表均原样保留，没有重新设计版式。

### 报告填写

用 `python-docx` 打开转换后的模板，只向既有单元格内追加内容：

- 封面信息表只填写实验项目名称与实验日期；实验者、专业班级、组别、同组者、实验成绩留空。
- 第一部分：实验目的、原理（静态审查与性能分析）、仪器与环境、技术路线。
- 第二部分：三个静态工具的截图与结果表；性能基线原始数据；**优化前后完整源代码对照**（`trains.js`、`models/index.js` 索引片段、`config.js`，共 9 段代码）；优化后复测；14 个过程问题与复现命令。
- 第三部分：数据计算方法、Amdahl 与 Little 定律校验、静态审查分析、数据库层/端到端分析、结论与后续方向。
- 模板原有的“成绩评定表”嵌套表格整体保留，没有被重建或改写。

源代码对照不是只贴 diff，而是把优化前后的完整文件分别排版，并标注行数与关键改动，便于直接核对：

| 文件 | 优化前 | 优化后 | 关键改动 |
| --- | ---: | ---: | --- |
| `server/src/controllers/trains.js` | 18 行 | 27 行 | 四路 `$or` 查询 + Map 余票匹配 |
| `server/src/models/index.js` | 34 行 | 39 行 | 新增 4 条复合索引 |
| `server/src/config.js` | 12 行 | 14 行 | JWT 密钥转为 `KeyObject` |

### 排版校验

用 Word 导出 PDF，再逐页检查。模板的大单元格会跨页，Word 不会在表格单元格内执行手动分页，因此 `page_break_before`、标题内的显式分页符都无法控制 1.2.2、1.4、2.2.4、2.3.4、3.4 等标题的分页；改为微调标题段前距，把标题与后续表格一起推到下一页。最终为 24 页，表 2-6、表 2-12 与成绩评定表均完整落在同一页，成绩表位于第 24 页，无空白页。

嵌套在模板单元格内的表格无法可靠地“重复标题行”；最终版通过控制表格起始位置避免了大表跨页，没有依赖重复表头。

### 数据一致性修正

重排时复核了早期归档，发现底稿中“优化后 523.2/495.9/580.0 req/s”没有原始文件支持；归档实际为 142.5/148.9/153.3 req/s，且该轮受 I/O 漂移影响，不能用于比较。已在 `实验报告.md` 中改为归档真实值并说明漂移原因。

2026-10-22 用 Docker 重跑后，旧的配对结果（253.2 → 277.5 req/s）也被归档，不再作为最终结论；正式报告统一使用 Docker 配对数据（343.8 → 424.0 req/s，+23.3%），数据库层为 3 ms/8,000 文档 → 0 ms/3 文档。
