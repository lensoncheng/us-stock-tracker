var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/stock-list.ts
var ALL_STOCKS = [
  "NVDA",
  "TSLA",
  "AAPL",
  "MSFT",
  "AMZN",
  "GOOGL",
  "META",
  "TSM",
  "AVGO",
  "AMD",
  "QCOM",
  "INTC",
  "ASML",
  "MU",
  "MRVL",
  "ORCL",
  "ADBE",
  "CRM",
  "NFLX",
  "PYPL",
  "CSCO",
  "V",
  "MA",
  "IBM",
  "LLY",
  "JNJ",
  "JPM",
  "BAC",
  "WFC",
  "MS",
  "GS",
  "VZ",
  "T",
  "TMUS",
  "NEE",
  "FTNT",
  "WMT",
  "COST",
  "HD",
  "LOW",
  "STX",
  "CAT",
  "DE",
  "ON",
  "SWKS",
  "AMAT",
  "LRCX",
  "AI",
  "SMCI",
  "ENPH",
  "SEDG",
  "FSLR",
  "CLS",
  "AAOI",
  "FINT",
  "CIEN",
  "JNPR",
  "SBUX",
  "MCD",
  "NKE",
  "DIS",
  "PEP",
  "KO",
  "TGT",
  "TXN",
  "KLAC",
  "AMAT",
  "SNDK",
  "WDC",
  "STC",
  "NTAP",
  "CEG",
  "VST",
  "NEE",
  "SO",
  "DUK",
  "AEP",
  "EXC",
  "OKLO",
  "BWXT",
  "SMR",
  "NBIS",
  "APLD",
  "IRM",
  "DLR",
  "EQIX",
  "XOM",
  "CVX",
  "PSX",
  "MPC",
  "VLO",
  "ABBV",
  "MRK",
  "PFE",
  "BMY",
  "AMGN",
  "GILD",
  "PLTR",
  "SHOP",
  "SNOW",
  "DDOG",
  "NET",
  "ROKU",
  "PINS",
  "UBER",
  "LYFT",
  "ABNB",
  "RIVN",
  "LCID",
  "NIO",
  "XPEV",
  "LI"
];

// src/file-system.ts
var FileSystem = class {
  static {
    __name(this, "FileSystem");
  }
  kv;
  constructor(kv) {
    this.kv = kv;
  }
  // 写入数据：数组 → JSON字符串
  async write(symbol2, type, lines) {
    const key = `${symbol2}::${type}`;
    await this.kv.put(key, JSON.stringify(lines));
  }
  // 读取数据：JSON字符串 → 数组
  async read(symbol2, type) {
    const key = `${symbol2}::${type}`;
    const raw = await this.kv.get(key);
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.error(`[FileSystem] \u89E3\u6790KV\u6570\u636E\u5931\u8D25: ${key}`, e);
      return [];
    }
  }
};

// src/fetcher.ts
async function updateStock(symbol2, keys, fs, env) {
  console.log(`[FETCH] ${symbol2} \u5F00\u59CB\u62C9\u53D6`);
  let lines = await fetchTwelve(symbol2, keys.twelveData);
  if (!lines || lines.length === 0) {
    console.log(`[FETCH] ${symbol2} \u4E3B\u6E90\u5931\u8D25\uFF0C\u5207\u6362\u5907\u7528\u6E90`);
    lines = await fetchAlpha(symbol2, keys.alphaVantage);
  }
  if (!lines || lines.length === 0) {
    console.error(`[FETCH] ${symbol2} \u6240\u6709\u6570\u636E\u6E90\u5747\u5931\u8D25`);
    return;
  }
  await fs.write(symbol2, "data", lines);
  await fs.write(symbol2, "signal", []);
  await saveToD1(symbol2, lines, env.DB);
  console.log(`[FETCH] ${symbol2} \u5B8C\u6210 \u2192 KV + D1 \u53CC\u5B58\u50A8`);
}
__name(updateStock, "updateStock");
async function fetchTwelve(symbol2, key) {
  if (!key) return null;
  try {
    const url = `https://api.twelvedata.com/time_series?symbol=${symbol2}&interval=1day&outputsize=500&apikey=${key}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status !== "ok" || !data.values) return null;
    return data.values.map((v) => `${v.datetime},${v.open},${v.high},${v.low},${v.close},${v.volume}`).reverse();
  } catch (e) {
    return null;
  }
}
__name(fetchTwelve, "fetchTwelve");
async function fetchAlpha(symbol2, key) {
  if (!key) return null;
  try {
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol2}&apikey=${key}`;
    const res = await fetch(url);
    const data = await res.json();
    const ts = data["Time Series (Daily)"];
    if (!ts) return null;
    return Object.entries(ts).sort((a, b) => a[0].localeCompare(b[0])).map(
      ([d, v]) => `${d},${v["1. open"]},${v["2. high"]},${v["3. low"]},${v["4. close"]},${v["5. volume"]}`
    );
  } catch (e) {
    return null;
  }
}
__name(fetchAlpha, "fetchAlpha");
async function saveToD1(symbol2, lines, db) {
  try {
    for (const line of lines) {
      const [date, open, high, low, close, volume] = line.split(",");
      await db.prepare(`
        INSERT OR REPLACE INTO stock_daily (symbol, date, open, high, low, close, volume)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        symbol2,
        date,
        parseFloat(open),
        parseFloat(high),
        parseFloat(low),
        parseFloat(close),
        parseFloat(volume)
      ).run();
    }
  } catch (e) {
    console.error("D1 \u5199\u5165\u5931\u8D25", e);
  }
}
__name(saveToD1, "saveToD1");

// src/html-content.ts
var HTML_CONTENT = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>\u7F8E\u80A1\u667A\u80FD\u8DDF\u8E2A\u7CFB\u7EDF</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js"><\/script>
<script src="https://cdn.jsdelivr.net/npm/luxon@3"><\/script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-adapter-luxon@1"><\/script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0b1220;color:#fff;padding:24px;font-family:system-ui}
.container{max-width:1200px;margin:0 auto}

.title{font-size:30px;margin-bottom:24px;color:#00d1ff}

.tabs{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px}
.tab{padding:10px 16px;background:#1a243a;border-radius:10px;cursor:pointer}
.tab.active{background:#00d1ff;color:#000}

.stock-list{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px}
.stock{padding:10px 14px;background:#1e293b;border-radius:10px;cursor:pointer;transition:0.2s}
.stock.active{background:#00d1ff;color:#000;font-weight:600}

.info-box{
  background:#0f172a;
  border-radius:16px;
  padding:20px 24px;
  margin-bottom:20px;
}

.chart-box{
  background:#0f172a;
  border-radius:16px;
  padding:24px;
  margin-bottom:20px
}

canvas{height:600px !important}

.signal-box{
  background:#0f172a;
  border-radius:16px;
  padding:24px;
  max-height:300px;
  overflow-y:auto;
}

.signal-row{
  display:flex;justify-content:space-between;
  padding:10px 0;
  border-bottom:1px solid #2a3547
}
.signal-date{color:#aaa}
.signal-strategy{color:#00d1ff}
.signal-action-buy{color:#ff4444;font-weight:600}
.signal-action-sell{color:#22cc88;font-weight:600}

.news-item{margin:8px 0}
.news-item a{color:#00d1ff;text-decoration:none}
.news-item a:hover{text-decoration:underline}
</style>
</head>
<body>
<div class="container">
  <div class="title">\u{1F4C8} \u7F8E\u80A1\u667A\u80FD\u8DDF\u8E2A\u7CFB\u7EDF</div>
  <div class="tabs" id="tabs"></div>
  <div class="stock-list" id="list"></div>

  <div class="info-box">
    <h3 id="stockName">\u6807\u7684\u4FE1\u606F</h3>
    <p id="stockIndex" style="margin:6px 0"></p>
    <h4 style="margin-top:12px">\u6700\u65B0\u76F8\u5173\u65B0\u95FB</h4>
    <div id="newsList">\u52A0\u8F7D\u4E2D...</div>
  </div>

  <div class="chart-box"><canvas id="chart"></canvas></div>

  <div class="signal-box">
    <h3>\u4E70\u5356\u4FE1\u53F7\u8BB0\u5F55</h3>
    <div id="signalList"></div>
  </div>
</div>

<script>
const groups = {
"\u4E03\u59D0\u59B9":["AAPL","AMZN","TSLA","GOOGL","MSFT","NVDA","META"],
"AI\u786C\u4EF6":["NVDA","AMD","TSM","ASML","MU","MRVL","ON","SWKS","AMAT","LRCX"],
"AI\u5927\u6A21\u578B":["MSFT","GOOGL","META","AMZN","PLTR","AI","ROKU","SMCI"],
"\u65B0\u80FD\u6E90":["TSLA","NIO","XPEV","LI","RIVN","LCID","ENPH","SEDG","FSLR"],
"\u5149\u901A\u4FE1":["CLS","AAOI","FTNT","CIEN"],
"\u6D88\u8D39":["SBUX","MCD","NKE","DIS","PEP","KO","WMT","TGT","HD"],
"\u534A\u5BFC\u4F53":["INTC","QCOM","AVGO","TXN","KLAC","AMAT","MU"],
"\u5B58\u50A8":["SNDK","WDC","STX","NTAP"],
"\u7535\u529B(\u6838\u7535)":["CEG","VST","NEE","SO","DUK","AEP","EXC","OKLO","BWXT","SMR"],
"\u6570\u636E\u4E2D\u5FC3":["EQIX","DLR","IRM","APLD","NBIS","ORCL"]
};

const stockMeta = {
  NVDA: { name: "\u82F1\u4F1F\u8FBE", index: "\u7EB3\u65AF\u8FBE\u514B100\u3001\u6807\u666E500" },
  AMD: { name: "\u8D85\u5A01\u534A\u5BFC\u4F53", index: "\u7EB3\u65AF\u8FBE\u514B100\u3001\u6807\u666E500" },
  TSM: { name: "\u53F0\u79EF\u7535", index: "\u6807\u666E500\u3001\u7EB3\u65AF\u8FBE\u514B" },
  ASML: { name: "\u963F\u65AF\u9EA6", index: "\u7EB3\u65AF\u8FBE\u514B" },
  MU: { name: "\u7F8E\u5149\u79D1\u6280", index: "\u6807\u666E500" },
  MRVL: { name: "\u7F8E\u6EE1\u7535\u5B50", index: "\u7EB3\u65AF\u8FBE\u514B" },
  ON: { name: "\u5B89\u68EE\u7F8E\u534A\u5BFC\u4F53", index: "\u6807\u666E500" },
  SWKS: { name: "\u601D\u4F73\u8BAF", index: "\u7EB3\u65AF\u8FBE\u514B" },
  AMAT: { name: "\u5E94\u7528\u6750\u6599", index: "\u6807\u666E500" },
  LRCX: { name: "\u6CDB\u6797\u534A\u5BFC\u4F53", index: "\u6807\u666E500" },
  MSFT: { name: "\u5FAE\u8F6F", index: "\u9053\u743C\u65AF\u3001\u7EB3\u65AF\u8FBE\u514B100\u3001\u6807\u666E500" },
  GOOGL: { name: "\u8C37\u6B4CA", index: "\u7EB3\u65AF\u8FBE\u514B100\u3001\u6807\u666E500" },
  META: { name: "\u5143\u5B87\u5B99\u5E73\u53F0", index: "\u7EB3\u65AF\u8FBE\u514B100\u3001\u6807\u666E500" },
  AMZN: { name: "\u4E9A\u9A6C\u900A", index: "\u7EB3\u65AF\u8FBE\u514B100\u3001\u6807\u666E500" },
  PLTR: { name: "\u5E15\u5170\u63D0\u5C14\u79D1\u6280", index: "\u7EBD\u7EA6\u8BC1\u5238\u4EA4\u6613\u6240" },
  AI: { name: "C3.ai", index: "\u7EBD\u7EA6\u8BC1\u5238\u4EA4\u6613\u6240" },
  ROKU: { name: "\u4E50\u53D9\u7535\u89C6", index: "\u7EB3\u65AF\u8FBE\u514B" },
  SMCI: { name: "\u8D85\u5FAE\u7535\u8111", index: "\u7EB3\u65AF\u8FBE\u514B" },
  TSLA: { name: "\u7279\u65AF\u62C9", index: "\u7EB3\u65AF\u8FBE\u514B100\u3001\u6807\u666E500" },
  NIO: { name: "\u851A\u6765", index: "\u7EBD\u7EA6\u8BC1\u5238\u4EA4\u6613\u6240" },
  XPEV: { name: "\u5C0F\u9E4F\u6C7D\u8F66", index: "\u7EBD\u7EA6\u8BC1\u5238\u4EA4\u6613\u6240" },
  LI: { name: "\u7406\u60F3\u6C7D\u8F66", index: "\u7EB3\u65AF\u8FBE\u514B" },
  RIVN: { name: "Rivian Automotive", index: "\u7EB3\u65AF\u8FBE\u514B" },
  LCID: { name: "Lucid\u96C6\u56E2", index: "\u7EB3\u65AF\u8FBE\u514B" },
  ENPH: { name: "Enphase\u80FD\u6E90", index: "\u7EB3\u65AF\u8FBE\u514B" },
  SEDG: { name: "\u9633\u5149\u7535\u6E90", index: "\u7EB3\u65AF\u8FBE\u514B" },
  FSLR: { name: "\u7B2C\u4E00\u592A\u9633\u80FD", index: "\u7EB3\u65AF\u8FBE\u514B" },
  CLS: { name: "\u79D1\u96F7\u68EE", index: "\u7EBD\u7EA6\u8BC1\u5238\u4EA4\u6613\u6240" },
  AAOI: { name: "\u5E94\u7528\u5149\u7535", index: "\u7EB3\u65AF\u8FBE\u514B" },
  FTNT: { name: "\u98DE\u5854\u4FE1\u606F", index: "\u7EB3\u65AF\u8FBE\u514B" },
  CIEN: { name: "Ciena\u901A\u8BAF", index: "\u7EB3\u65AF\u8FBE\u514B" },
  JNPR: { name: "\u77BB\u535A\u7F51\u7EDC", index: "\u7EB3\u65AF\u8FBE\u514B" },
  SBUX: { name: "\u661F\u5DF4\u514B", index: "\u6807\u666E500" },
  MCD: { name: "\u9EA6\u5F53\u52B3", index: "\u9053\u743C\u65AF\u3001\u6807\u666E500" },
  NKE: { name: "\u8010\u514B", index: "\u6807\u666E500" },
  DIS: { name: "\u8FEA\u58EB\u5C3C", index: "\u9053\u743C\u65AF\u3001\u6807\u666E500" },
  PEP: { name: "\u767E\u4E8B\u53EF\u4E50", index: "\u6807\u666E500" },
  KO: { name: "\u53EF\u53E3\u53EF\u4E50", index: "\u9053\u743C\u65AF\u3001\u6807\u666E500" },
  WMT: { name: "\u6C83\u5C14\u739B", index: "\u9053\u743C\u65AF\u3001\u6807\u666E500" },
  TGT: { name: "\u5854\u5409\u7279", index: "\u6807\u666E500" },
  HD: { name: "\u5BB6\u5F97\u5B9D", index: "\u9053\u743C\u65AF\u3001\u6807\u666E500" },
  INTC: { name: "\u82F1\u7279\u5C14", index: "\u9053\u743C\u65AF\u3001\u6807\u666E500" },
  QCOM: { name: "\u9AD8\u901A", index: "\u7EB3\u65AF\u8FBE\u514B100\u3001\u6807\u666E500" },
  AVGO: { name: "\u535A\u901A", index: "\u7EB3\u65AF\u8FBE\u514B100\u3001\u6807\u666E500" },
  TXN: { name: "\u5FB7\u5DDE\u4EEA\u5668", index: "\u6807\u666E500" },
  KLAC: { name: "\u79D1\u78CA\u534A\u5BFC\u4F53", index: "\u6807\u666E500" },
  SNDK: { name: "\u95EA\u8FEA", index: "\u7EB3\u65AF\u8FBE\u514B" },
  WDC: { name: "\u897F\u90E8\u6570\u636E", index: "\u7EB3\u65AF\u8FBE\u514B" },
  STX: { name: "\u5E0C\u6377\u79D1\u6280", index: "\u7EB3\u65AF\u8FBE\u514B" },
  NTAP: { name: "\u7F51\u5B58", index: "\u7EB3\u65AF\u8FBE\u514B" },
  CEG: { name: "\u661F\u5EA7\u80FD\u6E90", index: "\u7EBD\u7EA6\u8BC1\u4EA4\u6240" },
  VST: { name: "\u7EF4\u65AF\u5854\u80FD\u6E90", index: "\u7EBD\u7EA6\u8BC1\u4EA4\u6240" },
  NEE: { name: "\u65B0\u7EAA\u5143\u80FD\u6E90", index: "\u6807\u666E500" },
  SO: { name: "\u5357\u65B9\u7535\u529B", index: "\u6807\u666E500" },
  DUK: { name: "\u675C\u514B\u80FD\u6E90", index: "\u6807\u666E500" },
  AEP: { name: "\u7F8E\u56FD\u7535\u529B", index: "\u6807\u666E500" },
  EXC: { name: "\u7231\u514B\u65AF\u9F99\u7535\u529B", index: "\u6807\u666E500" },
  OKLO: { name: "Oklo\u6838\u7535", index: "\u7EB3\u65AF\u8FBE\u514B" },
  BWXT: { name: "BWX\u6838\u7535\u6280\u672F", index: "\u7EBD\u7EA6\u8BC1\u4EA4\u6240" },
  EQIX: { name: "Equinix\u6570\u636E\u4E2D\u5FC3", index: "\u7EB3\u65AF\u8FBE\u514B100" },
  DLR: { name: "Digital Realty", index: "\u6807\u666E500" },
  IRM: { name: "Iron Mountain", index: "\u6807\u666E500" },
  APLD: { name: "Apollo Realty", index: "\u7EBD\u7EA6\u8BC1\u4EA4\u6240" },
  NBIS: { name: "Nebius", index: "\u7EB3\u65AF\u8FBE\u514B" },
  ORCL: { name: "\u7532\u9AA8\u6587", index: "\u6807\u666E500\u3001\u7EB3\u65AF\u8FBE\u514B100" }
};

let chart = null;
let currentSymbol = null;

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

function setActiveStock(sym) {
  document.querySelectorAll('.stock').forEach(el => {
    el.classList.remove('active');
    if(el.innerText === sym) el.classList.add('active');
  });
}

async function load(sym) {
  currentSymbol = sym;
  setActiveStock(sym);

  const meta = stockMeta[sym] || { name: sym, index: "\u672A\u6536\u5F55" };
  document.getElementById('stockName').innerText = \`\${sym} | \${meta.name}\`;
  document.getElementById('stockIndex').innerText = \`\u6536\u5F55\u6307\u6570\uFF1A\${meta.index}\`;
  document.getElementById('newsList').innerHTML = "\u65B0\u95FB\u52A0\u8F7D\u4E2D...";

  loadNewsAsync(sym);

  const res = await fetch('/api?symbol=' + sym);
  const data = await res.json();
  renderSignals(data);
  renderChart(sym, data);
}

// ====================== \u524D\u7AEF\u8BF7\u6C42\u540E\u7AEF /news\uFF0C\u4E0D\u5E26KEY ======================
async function loadNewsAsync(sym) {
  try {
    const r = await fetch('/news?symbol=' + sym);
    const d = await r.json();
    const el = document.getElementById('newsList');
    el.innerHTML = '';
    if (d.articles) {
      d.articles.slice(0,3).forEach(a => {
        const div = document.createElement('div');
        div.className = 'news-item';
        div.innerHTML = \`<a href="\${a.url}" target="_blank">\${a.title}</a>\`;
        el.appendChild(div);
      });
    } else {
      el.innerHTML = "\u6682\u65E0\u65B0\u95FB";
    }
  } catch (e) {
    document.getElementById('newsList').innerHTML = "\u65B0\u95FB\u52A0\u8F7D\u5931\u8D25";
  }
}

function renderSignals(data) {
  const sigEl = document.getElementById('signalList');
  sigEl.innerHTML = '';
  const sigs = [];
  data.buyPoints?.forEach(d => sigs.push({date:d, type:'BUY'}));
  data.sellPoints?.forEach(d => sigs.push({date:d, type:'SELL'}));
  
  if (sigs.length === 0) {
    sigEl.innerHTML = '<p style="color:#aaa;">\u6682\u65E0\u4E70\u5356\u4FE1\u53F7</p>';
    return;
  }

  sigs.sort((a,b) => new Date(b.date) - new Date(a.date));
  sigs.forEach(s => {
    const row = document.createElement('div');
    row.className = 'signal-row';
    row.innerHTML = \`
      <span class="signal-date">\${s.date}</span>
      <span class="signal-strategy">\u7EFC\u5408\u7B56\u7565</span>
      <span class="\${s.type==='BUY'?'signal-action-buy':'signal-action-sell'}">
        \${s.type==='BUY'?'\u4E70\u5165':'\u5356\u51FA'}
      </span>
    \`;
    sigEl.appendChild(row);
  });
}

function renderChart(sym, data) {
  if (chart) chart.destroy();
  chart = new Chart(document.getElementById('chart'), {
    type: 'line',
    data: {
      datasets: [
        {
          label: \`\${sym} \u6536\u76D8\u4EF7\`,
          data: data.dates.map((d, i) => ({ x: d, y: data.closes[i] })),
          borderColor: '#00d1ff',
          borderWidth: 2,
          pointRadius: 0,
          fill: true,
          backgroundColor: 'rgba(0,209,255,0.1)'
        },
        {
          type: 'scatter', label: '\u4E70\u5165',
          data: data.buyPoints.map(d => ({ x: d, y: data.closes[data.dates.indexOf(d)] })),
          backgroundColor: 'red', pointStyle: 'triangle', rotation: 180, radius: 8
        },
        {
          type: 'scatter', label: '\u5356\u51FA',
          data: data.sellPoints.map(d => ({ x: d, y: data.closes[data.dates.indexOf(d)] })),
          backgroundColor: '#22cc88', pointStyle: 'triangle', rotation: 0, radius: 8
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
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
<\/script>
</body>
</html>
`;

// src/index.ts
var MAX_DATA_LENGTH = 100;
var BATCH_1 = ALL_STOCKS.slice(0, 33);
var BATCH_2 = ALL_STOCKS.slice(33);
var src_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/") {
      return new Response(HTML_CONTENT, {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }
    if (url.pathname === "/load") {
      try {
        const symbol2 = url.searchParams.get("symbol");
        if (!symbol2) return Response.json({ ok: false, error: "\u7F3A\u5C11 symbol" });
        const upper = symbol2.toUpperCase();
        if (!ALL_STOCKS.includes(upper)) return Response.json({ ok: false, error: "\u4E0D\u5728\u767D\u540D\u5355" });
        const fs = new FileSystem(env.STOCK_DB);
        await updateStock(upper, {
          twelveData: env.TWELVEDATA_API_KEY,
          alphaVantage: env.ALPHA_VANTAGE_API_KEY
        }, fs, env);
        const cnt = (await fs.read(upper, "data")).length;
        return Response.json({ ok: true, symbol: upper, data_line_count: cnt });
      } catch (e) {
        return Response.json({ ok: false, error: String(e) });
      }
    }
    if (url.pathname === "/load-batch1") {
      return this.runBatch(BATCH_1, env, "\u6279\u6B211");
    }
    if (url.pathname === "/load-batch2") {
      return this.runBatch(BATCH_2, env, "\u6279\u6B212");
    }
    if (url.pathname === "/api") {
      try {
        const symbol2 = (url.searchParams.get("symbol") || "NVDA").toUpperCase();
        if (!ALL_STOCKS.includes(symbol2)) {
          return Response.json({ error: "invalid symbol" }, { status: 400 });
        }
        const fs = new FileSystem(env.STOCK_DB);
        const data = await fs.read(symbol2, "data");
        const signalLines = await fs.read(symbol2, "signal");
        const dates = [];
        const closes = [];
        for (const line of data) {
          const parts = line.split(",");
          if (parts.length >= 5) {
            dates.push(parts[0]);
            closes.push(parseFloat(parts[4]) || 0);
          }
        }
        const buyPoints = [];
        const sellPoints = [];
        for (const line of signalLines) {
          const trim = line.trim();
          if (!trim) continue;
          const sp = trim.split(",");
          if (sp.length < 2) continue;
          if (sp[1] === "BUY") buyPoints.push(sp[0]);
          if (sp[1] === "SELL") sellPoints.push(sp[0]);
        }
        const finalDates = dates.slice(-MAX_DATA_LENGTH);
        const finalCloses = closes.slice(-MAX_DATA_LENGTH);
        const dateSet = new Set(finalDates);
        const finalBuy = buyPoints.filter((d) => dateSet.has(d));
        const finalSell = sellPoints.filter((d) => dateSet.has(d));
        return Response.json({
          symbol: symbol2,
          dates: finalDates,
          closes: finalCloses,
          buyPoints: finalBuy,
          sellPoints: finalSell
        });
      } catch (err) {
        console.error("API\u9519\u8BEF:", err);
        return Response.json({
          symbol: symbol || "NVDA",
          dates: [],
          closes: [],
          buyPoints: [],
          sellPoints: []
        });
      }
    }
    return new Response("Not found", { status: 404 });
  },
  // 批次执行
  async runBatch(list, env, name) {
    const fs = new FileSystem(env.STOCK_DB);
    let success = 0;
    for (const sym of list) {
      try {
        await updateStock(sym, {
          twelveData: env.TWELVEDATA_API_KEY,
          alphaVantage: env.ALPHA_VANTAGE_API_KEY
        }, fs, env);
        success++;
        console.log(`[${name}] \u6210\u529F: ${sym}`);
      } catch (e) {
        console.log(`[${name}] \u5931\u8D25: ${sym}`, e);
      }
      await new Promise((r) => setTimeout(r, 3e4));
    }
    return Response.json({ batch: name, total: list.length, success });
  },
  // Cron 定时
  async scheduled(event, env) {
    await this.runBatch(BATCH_1, env, "\u5B9A\u65F6\u6279\u6B211");
  }
};

// ../../.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-6UPfna/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// ../../.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-6UPfna/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
