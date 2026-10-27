const path = require('node:path');
const { pathToFileURL } = require('node:url');
const puppeteer = require('./tools/node_modules/puppeteer-core');

const root = path.resolve(__dirname, '..');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const pages = process.argv.slice(2).length
  ? JSON.parse(process.argv[2])
  : [
      ['experiments/static/eslint-browser.html', 'experiments/assets/static-01-eslint-frontend.png'],
      ['experiments/static/eslint-server.html', 'experiments/assets/static-02-eslint-server.png'],
      ['experiments/static/semgrep-report.html', 'experiments/assets/static-03-semgrep.png'],
      ['experiments/static/npm-audit-report.html', 'experiments/assets/static-04-npm-audit.png']
    ];

(async () => {
  const browser = await puppeteer.launch({ executablePath: edge, headless: true, args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'] });
  try {
    for (const [file, output] of pages) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1.5 });
      await page.goto(pathToFileURL(path.join(root, file)).href, { waitUntil: file.includes('clinic-flame') ? 'load' : 'networkidle0', timeout: 60000 });
      if (file.includes('eslint')) {
        await page.evaluate(() => document.querySelectorAll('th').forEach(th => th.click()));
      }
      if (file.includes('clinic-flame')) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      await new Promise(resolve => setTimeout(resolve, 300));
      const size = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }));
      await page.screenshot({ path: path.join(root, output), fullPage: true });
      console.log(`${output}  ${size.width}x${size.height}`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
