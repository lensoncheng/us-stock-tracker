const fs = require("fs");
const path = require("path");

// 定义所有文件
const files = [
  {
    path: "./wrangler.toml",
    content: `name = "us-stock-tracker"
main = "src/index.ts"
compatibility_date = "2025-04-15"

[vars]
ALPHA_VANTAGE_API_KEY = "你的AlphaVantage密钥"

[[kv_namespaces]]
binding = "STOCK_DB"
id = "你的stock_db KV_ID"

[triggers]
crons = [ "0 6 * * 1-5" ]
`
  },
  {
    path: "./src/env.ts",
    content: `export interface Env {
  ALPHA_VANTAGE_API_KEY: string;
  STOCK_DB: KVNamespace;
}`
  },
  {
    path: "./src/stock-list.ts",
    content: `export const STOCK_LISTS = {
  aiHardware: ["NVDA", "AMD", "TSM", "ASML", "MU", "MRVL", "ON", "SWKS", "AMAT", "LRCX"],
  aiModel: ["MSFT", "GOOGL", "META", "AMZN", "GOOG", "PLTR", "AI", "ROKU", "SMCI"],
  newEnergy: ["TSLA", "NIO", "XPEV", "LI", "RIVN", "LCID", "ENPH", "SEDG", "FSLR"],
  optical: ["CLS", "AAOI", "FTNT", "CIEN", "JNPR"],
  consumer: ["SBUX", "MCD", "NKE", "DIS", "PEP", "KO", "WMT", "TGT", "HD"],
  semiconductor: ["INTC", "QCOM", "AVGO", "TXN", "KLAC", "AMAT"]
};

export const ALL_STOCKS = Array.from(new Set(Object.values(STOCK_LISTS).flat()));`
  },
  {
    path: "./src/file-system.ts",
    content: `export class FileSystem {
  private kv: KVNamespace;
  constructor(kv: KVNamespace) {
    this.kv = kv;
  }

  private path(symbol: string, type: 'data' | 'signal' = 'data') {
    return type === 'data' ? \`data/\${symbol}.txt\` : \`data/\${symbol}.signal.txt\`;
  }

  async read(symbol: string, type: 'data' | 'signal' = 'data') {
    const text = await this.kv.get(this.path(symbol, type));
    if (!text) return [];
    return text.trim().split('\\n').filter(l => l);
  }

  async write(symbol: string, lines: string[], type: 'data' | 'signal' = 'data') {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const cutoff = threeMonthsAgo.toISOString().split('T')[0];

    const filtered = lines.filter(line => {
      const date = line.split(',')[0];
      return date >= cutoff;
    });

    await this.kv.put(this.path(symbol, type), filtered.join('\\n'));
  }

  async append(symbol: string, line: string, type: 'data' | 'signal' = 'data') {
    const lines = await this.read(symbol, type);
    if (lines.includes(line)) return;
    lines.push(line);
    await this.write(symbol, lines, type);
  }
}`
  },
  {
    path: "./src/strategy.ts",
    content: `export function calculateAllSignals(dates: string[], closes: number[]) {
  const buy: string[] = [];
  const sell: string[] = [];

  const ma = getMA(dates, closes);
  const rsi = getRSI(dates, closes);
  const macd = getMACD(dates, closes);
  const boll = getBOLL(dates, closes);

  buy.push(...ma.buy, ...rsi.buy, ...macd.buy, ...boll.buy);
  sell.push(...ma.sell, ...rsi.sell, ...macd.sell, ...boll.sell);

  return {
    buyPoints: Array.from(new Set(buy)),
    sellPoints: Array.from(new Set(sell))
  };
}

function getMA(dates: string[], closes: number[]) {
  const buy: string[] = [];
  const sell: string[] = [];
  for (let i = 20; i < closes.length; i++) {
    const ma5 = closes.slice(i - 5, i).reduce((a, b) => a + b) / 5;
    const ma20 = closes.slice(i - 20, i).reduce((a, b) => a + b) / 20;
    const p5 = closes.slice(i - 6, i - 1).reduce((a, b) => a + b) / 5;
    const p20 = closes.slice(i - 21, i - 1).reduce((a, b) => a + b) / 20;
    if (p5 < p20 && ma5 > ma20) buy.push(dates[i]);
    if (p5 > p20 && ma5 < ma20) sell.push(dates[i]);
  }
  return { buy, sell };
}

function getRSI(dates: string[], closes: number[], period = 14) {
  const buy: string[] = [];
  const sell: string[] = [];
  const rsi: number[] = [];
  for (let i = period; i < closes.length; i++) {
    let gains = 0, losses = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const chg = closes[j] - closes[j - 1];
      if (chg > 0) gains += chg;
      else losses -= chg;
    }
    const rs = gains / losses || 0;
    rsi.push(100 - (100 / (1 + rs)));
  }
  for (let i = 0; i < rsi.length; i++) {
    const idx = i + period;
    if (rsi[i] < 30) buy.push(dates[idx]);
    if (rsi[i] > 70) sell.push(dates[idx]);
  }
  return { buy, sell };
}

function getMACD(dates: string[], closes: number[]) {
  const buy: string[] = [];
  const sell: string[] = [];
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macd = ema12.map((v, i) => v - ema26[i]);
  const signal = ema(macd, 9);
  for (let i = 1; i < macd.length; i++) {
    if (macd[i - 1] < signal[i - 1] && macd[i] > signal[i]) buy.push(dates[i]);
    if (macd[i - 1] > signal[i - 1] && macd[i] < signal[i]) sell.push(dates[i]);
  }
  return { buy, sell };
}

function getBOLL(dates: string[], closes: number[]) {
  const buy: string[] = [];
  const sell: string[] = [];
  const period = 20;
  for (let i = period; i < closes.length; i++) {
    const slice = closes.slice(i - period, i);
    const mid = slice.reduce((a, b) => a + b) / period;
    const std = Math.sqrt(slice.reduce((s, v) => s + (v - mid) ** 2, 0) / period);
    const upper = mid + 2 * std;
    const lower = mid - 2 * std;
    const c = closes[i];
    if (c < lower) buy.push(dates[i]);
    if (c > upper) sell.push(dates[i]);
  }
  return { buy, sell };
}

function ema(values: number[], period: number) {
  const k = 2 / (period + 1);
  const out: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    out.push(values[i] * k + out[i - 1] * (1 - k));
  }
  return out;
}`
  },
  {
    path: "./src/fetcher.ts",
    content: `import { FileSystem } from './file-system';
import { calculateAllSignals } from './strategy';

export async function updateStock(symbol: string, apiKey: string, fs: FileSystem) {
  const url = \`https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=\${symbol}&apikey=\${apiKey}&outputsize=compact\`;
  const res = await fetch(url);
  const data = await res.json();
  const ts = data['Time Series (Daily)'];
  if (!ts) return;

  const lines = await fs.read(symbol, 'data');
  const existing = new Set(lines.map(l => l.split(',')[0]));
  const sorted = Object.entries(ts).sort((a, b) => a[0].localeCompare(b[0]));

  const newLines: string[] = [];
  for (const [date, values] of sorted) {
    if (existing.has(date)) continue;
    const o = values['1. open'];
    const h = values['2. high'];
    const l = values['3. low'];
    const c = values['4. close'];
    const v = values['5. volume'];
    newLines.push(\`\${date},\${o},\${h},\${l},\${c},\${v}\`);
  }

  if (newLines.length === 0) return;
  await fs.write(symbol, [...lines, ...newLines], 'data');

  const all = await fs.read(symbol, 'data');
  const dates = all.map(l => l.split(',')[0]);
  const closes = all.map(l => parseFloat(l.split(',')[4]));
  const signals = calculateAllSignals(dates, closes);

  const sigLines: string[] = [];
  for (const d of signals.buyPoints) sigLines.push(\`\${d},BUY\`);
  for (const d of signals.sellPoints) sigLines.push(\`\${d},SELL\`);
  await fs.write(symbol, sigLines, 'signal');
}`
  },
  {
    path: "./src/index.ts",
    content: `import { Env } from './env';
import { ALL_STOCKS } from './stock-list';
import { FileSystem } from './file-system';
import { updateStock } from './fetcher';

export default {
  async fetch(request: Request, env: Env) {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol') || 'NVDA';
    if (!ALL_STOCKS.includes(symbol)) {
      return Response.json({ error: 'invalid symbol' }, { status: 400 });
    }

    const fs = new FileSystem(env.STOCK_DB);
    const dataLines = await fs.read(symbol, 'data');
    const sigLines = await fs.read(symbol, 'signal');

    if (dataLines.length === 0) {
      await updateStock(symbol, env.ALPHA_VANTAGE_API_KEY, fs);
      return this.fetch(request, env);
    }

    const dates = dataLines.map(l => l.split(',')[0]);
    const closes = dataLines.map(l => parseFloat(l.split(',')[4]));
    const buy = sigLines.filter(l => l.endsWith('BUY')).map(l => l.split(',')[0]);
    const sell = sigLines.filter(l => l.endsWith('SELL')).map(l => l.split(',')[0]);

    return Response.json({ symbol, dates, closes, buyPoints: buy, sellPoints: sell });
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const fs = new FileSystem(env.STOCK_DB);
    for (const sym of ALL_STOCKS) {
      try {
        await updateStock(sym, env.ALPHA_VANTAGE_API_KEY, fs);
        await new Promise(r => setTimeout(r, 1200));
      } catch (e) {}
    }
  }
};`
  },
  {
    path: "./public/index.html",
    content: `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>美股跟踪系统</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script src="https://cdn.jsdelivr.net/npm/luxon@3"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-adapter-luxon@1"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0b1220;color:#fff;padding:24px;font-family:system-ui}
.container{max-width:1200px;margin:0 auto}
.title{font-size:30px;margin-bottom:24px;color:#00d1ff}
.tabs{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px}
.tab{padding:10px 16px;background:#1a243a;border-radius:10px;cursor:pointer}
.tab.active{background:#00d1ff;color:#000}
.stock-list{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:30px}
.stock{padding:10px 14px;background:#1e293b;border-radius:10px;cursor:pointer}
.stock.active{background:#ff4444}
.chart-box{background:#0f172a;border-radius:16px;padding:24px}
canvas{height:600px !important}
</style>
</head>
<body>
<div class="container">
  <div class="title">📈 美股智能跟踪系统</div>
  <div class="tabs" id="tabs"></div>
  <div class="stock-list" id="list"></div>
  <div class="chart-box"><canvas id="chart"></canvas></div>
</div>

<script>
const groups = {
"AI硬件":["NVDA","AMD","TSM","ASML","MU","MRVL","ON","SWKS","AMAT","LRCX"],
"AI大模型":["MSFT","GOOGL","META","AMZN","PLTR","AI","ROKU","SMCI"],
"新能源":["TSLA","NIO","XPEV","LI","RIVN","LCID","ENPH","SEDG","FSLR"],
"光通信":["CLS","AAOI","FTNT","CIEN","JNPR"],
"消费":["SBUX","MCD","NKE","DIS","PEP","KO","WMT","TGT","HD"],
"半导体":["INTC","QCOM","AVGO","TXN","KLAC","AMAT"]
};

let chart = null;
const API = '/';

function renderTabs() {
  const t = document.getElementById('tabs');
  Object.keys(groups).forEach(g => {
    const div = document.createElement('div');
    div.className = 'tab';
    div.innerText = g;
    div.onclick = () => {
      document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      div.classList.add('active');
      renderList(g);
    };
    t.appendChild(div);
  });
  document.querySelector('.tab')?.click();
}

function renderList(g) {
  const el = document.getElementById('list');
  el.innerHTML = '';
  groups[g].forEach(s => {
    const d = document.createElement('div');
    d.className = 'stock';
    d.innerText = s;
    d.onclick = () => load(s);
    el.appendChild(d);
  });
}

async function load(sym) {
  const res = await fetch(API + '?symbol=' + sym);
  const data = await res.json();

  const datasets = [
    {
      label: sym + ' 收盘价',
      data: data.dates.map((d, i) => ({ x: d, y: data.closes[i] })),
      borderColor: '#00d1ff',
      borderWidth: 2,
      pointRadius: 0,
      fill: true,
      backgroundColor: 'rgba(0,209,255,0.1)'
    },
    {
      type: 'scatter',
      label: '买入',
      data: data.buyPoints.map(d => ({ x: d, y: data.closes[data.dates.indexOf(d)] })),
      backgroundColor: 'red',
      pointStyle: 'triangle',
      rotation: 180,
      radius: 8
    },
    {
      type: 'scatter',
      label: '卖出',
      data: data.sellPoints.map(d => ({ x: d, y: data.closes[data.dates.indexOf(d)] })),
      backgroundColor: '#22cc88',
      pointStyle: 'triangle',
      rotation: 0,
      radius: 8
    }
  ];

  if (chart) chart.destroy();
  chart = new Chart(document.getElementById('chart'), {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#fff' } } },
      scales: {
        x: { type: 'time', time: { unit: 'day' }, grid: { color: '#2a3547' } },
        y: { grid: { color: '#2a3547' } }
      }
    }
  });
}

renderTabs();
load('NVDA');
</script>
</body>
</html>`
  }
];

// 递归创建目录+写入文件
function writeAll() {
  for (const item of files) {
    const dir = path.dirname(item.path);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(item.path, item.content, "utf8");
  }
  console.log("✅ 全部项目文件生成完成！");
  console.log("👉 接下来操作：");
  console.log("1. 填写 wrangler.toml 里的密钥和KV-ID");
  console.log("2. 执行 wrangler deploy 部署");
}

writeAll();
