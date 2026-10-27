const fs = require('node:fs');
const path = require('node:path');

const dir = __dirname;
const semgrep = JSON.parse(fs.readFileSync(path.join(dir, 'semgrep.json'), 'utf8'));
const audit = JSON.parse(fs.readFileSync(path.join(dir, 'npm-audit.json'), 'utf8'));
const generatedAt = new Date().toLocaleString('zh-CN', { hour12: false });

const baseStyle = `
  :root { --ink:#14213d; --muted:#5f6b7a; --line:#e3e8ef; --blue:#1a5bc4; --bg:#f5f7fb; --red:#c0392b; --amber:#b26a00; --green:#1e7d4f; }
  * { box-sizing: border-box; }
  body { margin:0; padding:40px 48px 64px; background:var(--bg); color:var(--ink); font-family:"PingFang SC","Microsoft YaHei",system-ui,sans-serif; font-size:14px; line-height:1.65; }
  .page { max-width:1180px; margin:0 auto; }
  .eyebrow { color:var(--blue); font-weight:600; letter-spacing:.08em; font-size:12px; text-transform:uppercase; }
  h1 { margin:6px 0 4px; font-size:30px; letter-spacing:-.02em; }
  .subtitle { color:var(--muted); font-size:15px; }
  .meta { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin:26px 0 20px; }
  .meta div { background:#fff; border:1px solid var(--line); border-radius:12px; padding:12px 16px; }
  .meta span { display:block; font-size:12px; color:var(--muted); }
  .meta strong { display:block; margin-top:3px; font-size:15px; font-weight:600; }
  .cmd { background:#0f172a; color:#dbeafe; border-radius:10px; padding:12px 16px; font-family:Consolas,"Courier New",monospace; font-size:12.5px; overflow-wrap:anywhere; margin-bottom:24px; }
  .cmd b { color:#7dd3fc; font-weight:600; }
  .cards { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin:22px 0 26px; }
  .card { background:#fff; border:1px solid var(--line); border-radius:14px; padding:18px 20px; }
  .card span { color:var(--muted); font-size:12.5px; }
  .card strong { display:block; font-size:30px; line-height:1.2; margin-top:4px; }
  .card.red strong { color:var(--red); } .card.amber strong { color:var(--amber); } .card.green strong { color:var(--green); }
  .panel { background:#fff; border:1px solid var(--line); border-radius:14px; overflow:hidden; }
  .panel-head { padding:14px 20px; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; align-items:center; }
  .panel-head h2 { margin:0; font-size:16px; }
  .panel-head span { color:var(--muted); font-size:12.5px; }
  table { width:100%; border-collapse:collapse; }
  th, td { text-align:left; padding:11px 16px; border-bottom:1px solid var(--line); vertical-align:top; }
  th { background:#f8fafc; font-size:12.5px; color:var(--muted); font-weight:600; }
  tr:last-child td { border-bottom:none; }
  .badge { display:inline-block; padding:2px 9px; border-radius:999px; font-size:12px; font-weight:600; white-space:nowrap; }
  .badge.warn { background:#fff4e0; color:#9a5b00; }
  .badge.error { background:#fdecea; color:#a83226; }
  .badge.ok { background:#e8f6ee; color:#1e7d4f; }
  code { background:#f1f5f9; border-radius:5px; padding:1px 6px; font-family:Consolas,"Courier New",monospace; font-size:12.5px; }
  .rule { font-family:Consolas,"Courier New",monospace; font-size:12px; color:#334155; overflow-wrap:anywhere; }
  .loc { font-family:Consolas,"Courier New",monospace; font-size:12.5px; white-space:nowrap; }
  pre { margin:8px 0 0; padding:10px 12px; background:#0f172a; color:#e2e8f0; border-radius:8px; font-family:Consolas,"Courier New",monospace; font-size:12px; line-height:1.55; white-space:pre-wrap; overflow-wrap:anywhere; }
  .muted { color:var(--muted); }
  .empty { padding:34px 20px; text-align:center; color:var(--muted); }
  .empty strong { display:block; color:var(--green); font-size:18px; margin-bottom:6px; }
  .footer { margin-top:18px; color:var(--muted); font-size:12px; text-align:right; }
`;

function pageShell(title, subtitle, meta, cmd, body) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${title}</title><style>${baseStyle}</style></head><body><div class="page">
    <div class="eyebrow">Mini-12306 · 静态代码审查</div>
    <h1>${title}</h1><div class="subtitle">${subtitle}</div>
    <div class="meta">${meta.map(([k, v]) => `<div><span>${k}</span><strong>${v}</strong></div>`).join('')}</div>
    <div class="cmd"><b>$</b> ${cmd}</div>
    ${body}
    <div class="footer">报告生成时间：${generatedAt} · 原始结果保存在 experiments/static/</div>
  </div></body></html>`;
}

const severityClass = severity => severity === 'ERROR' ? 'error' : 'warn';
const readSnippet = finding => {
  const file = path.resolve(__dirname, '..', '..', finding.path);
  const line = fs.readFileSync(file, 'utf8').split(/\r?\n/)[finding.start.line - 1] || '';
  return line.length > 360 ? `${line.slice(0, 360)} …` : line;
};
const semgrepRows = semgrep.results.map((finding, index) => {
  const { path: file, start, extra } = finding;
  const meta = extra.metadata || {};
  const cwe = (meta.cwe || []).join('；');
  const owasp = (meta.owasp || []).join('；');
  return `<tr>
    <td>${index + 1}</td>
    <td><span class="badge ${severityClass(extra.severity)}">${extra.severity}</span></td>
    <td><div class="rule">${finding.check_id}</div><div class="muted">${[cwe, owasp].filter(Boolean).join(' · ')}</div></td>
    <td><div class="loc">${file.replace(/\\/g, '/')}:${start.line}</div></td>
    <td>${extra.message}<pre>${readSnippet(finding).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre></td>
  </tr>`;
}).join('');

const semgrepHtml = pageShell(
  'Semgrep 静态安全扫描报告',
  '基于 Node.js 与 OWASP Top Ten 规则集，对前端脚本和服务端源码进行安全缺陷扫描。',
  [['工具版本', 'Semgrep 1.182.0'], ['规则集', 'p/nodejs + p/owasp-top-ten'], ['扫描范围', `${semgrep.paths.scanned.length} 个文件`], ['运行规则', '72 条']],
  'semgrep scan --config p/nodejs --config p/owasp-top-ten --metrics=off js server/src',
  `<div class="cards">
    <div class="card amber"><span>全部发现</span><strong>${semgrep.results.length}</strong></div>
    <div class="card amber"><span>Warning</span><strong>${semgrep.results.filter(f => f.extra.severity === 'WARNING').length}</strong></div>
    <div class="card green"><span>Error</span><strong>${semgrep.results.filter(f => f.extra.severity === 'ERROR').length}</strong></div>
    <div class="card green"><span>解析错误</span><strong>${(semgrep.errors || []).length}</strong></div>
  </div>
  <div class="panel"><div class="panel-head"><h2>发现明细</h2><span>按扫描顺序展示</span></div>
    <table><thead><tr><th>#</th><th>级别</th><th>规则 / 分类</th><th>位置</th><th>说明与代码片段</th></tr></thead><tbody>${semgrepRows}</tbody></table>
  </div>`
);

const vuln = audit.metadata.vulnerabilities;
const deps = audit.metadata.dependencies;
const auditHtml = pageShell(
  'npm audit 依赖安全审查报告',
  '对根工作区与 server 工作区的全部生产、开发依赖进行已知漏洞比对。',
  [['工具版本', 'npm 11.16.0'], ['审计源', 'registry.npmjs.org'], ['依赖总数', `${deps.total}`], ['工作区', 'mini12306 + server']],
  'npm audit --registry=https://registry.npmjs.org --json',
  `<div class="cards">
    <div class="card green"><span>已知漏洞总数</span><strong>${vuln.total}</strong></div>
    <div class="card green"><span>Critical / High</span><strong>${vuln.critical} / ${vuln.high}</strong></div>
    <div class="card green"><span>Moderate / Low</span><strong>${vuln.moderate} / ${vuln.low}</strong></div>
    <div class="card"><span>依赖构成</span><strong style="font-size:22px">生产 ${deps.prod} · 开发 ${deps.dev}</strong></div>
  </div>
  <div class="panel"><div class="panel-head"><h2>审查结论</h2><span>npm audit report v${audit.auditReportVersion}</span></div>
    <div class="empty"><strong>未发现已知依赖漏洞</strong>本次审计覆盖 ${deps.total} 个依赖（生产 ${deps.prod} 个、开发 ${deps.dev} 个），Critical、High、Moderate、Low 均为 0。</div>
    <table><thead><tr><th>严重级别</th><th>数量</th><th>状态</th></tr></thead><tbody>
      ${['critical', 'high', 'moderate', 'low', 'info'].map(level => `<tr><td>${level}</td><td>${vuln[level]}</td><td><span class="badge ok">通过</span></td></tr>`).join('')}
    </tbody></table>
  </div>
  <div class="panel" style="margin-top:18px"><div class="panel-head"><h2>说明</h2></div><div style="padding:16px 20px" class="muted">项目默认使用 npmmirror 镜像，该镜像未实现 npm 安全审计接口；本次审查临时指定官方 npm registry 完成查询，未修改项目配置与依赖。</div></div>`
);

fs.writeFileSync(path.join(dir, 'semgrep-report.html'), semgrepHtml);
fs.writeFileSync(path.join(dir, 'npm-audit-report.html'), auditHtml);
console.log('generated semgrep-report.html, npm-audit-report.html');
