export const HTML_CONTENT = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>美股智能跟踪系统</title>
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
  <div class="title">📈 美股智能跟踪系统</div>
  <div class="tabs" id="tabs"></div>
  <div class="stock-list" id="list"></div>

  <div class="info-box">
    <h3 id="stockName">标的信息</h3>
    <p id="stockIndex" style="margin:6px 0"></p>
    <h4 style="margin-top:12px">最新相关新闻</h4>
    <div id="newsList">加载中...</div>
  </div>

  <div class="chart-box"><canvas id="chart"></canvas></div>

  <div class="signal-box">
    <h3>买卖信号记录</h3>
    <div id="signalList"></div>
  </div>
</div>

<script>
const groups = {
"七姐妹":["AAPL","AMZN","TSLA","GOOGL","MSFT","NVDA","META"],
"AI硬件":["NVDA","AMD","TSM","ASML","MU","MRVL","ON","SWKS","AMAT","LRCX"],
"AI大模型":["MSFT","GOOGL","META","AMZN","PLTR","AI","ROKU","SMCI"],
"新能源":["TSLA","NIO","XPEV","LI","RIVN","LCID","ENPH","SEDG","FSLR"],
"光通信":["CLS","AAOI","FTNT","CIEN"],
"消费":["SBUX","MCD","NKE","DIS","PEP","KO","WMT","TGT","HD"],
"半导体":["INTC","QCOM","AVGO","TXN","KLAC","AMAT","MU"],
"存储":["SNDK","WDC","STX","NTAP"],
"电力(核电)":["CEG","VST","NEE","SO","DUK","AEP","EXC","OKLO","BWXT","SMR"],
"数据中心":["EQIX","DLR","IRM","APLD","NBIS","ORCL"]
};

const stockMeta = {
  NVDA: { name: "英伟达", index: "纳斯达克100、标普500" },
  AMD: { name: "超威半导体", index: "纳斯达克100、标普500" },
  TSM: { name: "台积电", index: "标普500、纳斯达克" },
  ASML: { name: "阿斯麦", index: "纳斯达克" },
  MU: { name: "美光科技", index: "标普500" },
  MRVL: { name: "美满电子", index: "纳斯达克" },
  ON: { name: "安森美半导体", index: "标普500" },
  SWKS: { name: "思佳讯", index: "纳斯达克" },
  AMAT: { name: "应用材料", index: "标普500" },
  LRCX: { name: "泛林半导体", index: "标普500" },
  MSFT: { name: "微软", index: "道琼斯、纳斯达克100、标普500" },
  GOOGL: { name: "谷歌A", index: "纳斯达克100、标普500" },
  META: { name: "元宇宙平台", index: "纳斯达克100、标普500" },
  AMZN: { name: "亚马逊", index: "纳斯达克100、标普500" },
  PLTR: { name: "帕兰提尔科技", index: "纽约证券交易所" },
  AI: { name: "C3.ai", index: "纽约证券交易所" },
  ROKU: { name: "乐叙电视", index: "纳斯达克" },
  SMCI: { name: "超微电脑", index: "纳斯达克" },
  TSLA: { name: "特斯拉", index: "纳斯达克100、标普500" },
  NIO: { name: "蔚来", index: "纽约证券交易所" },
  XPEV: { name: "小鹏汽车", index: "纽约证券交易所" },
  LI: { name: "理想汽车", index: "纳斯达克" },
  RIVN: { name: "Rivian Automotive", index: "纳斯达克" },
  LCID: { name: "Lucid集团", index: "纳斯达克" },
  ENPH: { name: "Enphase能源", index: "纳斯达克" },
  SEDG: { name: "阳光电源", index: "纳斯达克" },
  FSLR: { name: "第一太阳能", index: "纳斯达克" },
  CLS: { name: "科雷森", index: "纽约证券交易所" },
  AAOI: { name: "应用光电", index: "纳斯达克" },
  FTNT: { name: "飞塔信息", index: "纳斯达克" },
  CIEN: { name: "Ciena通讯", index: "纳斯达克" },
  JNPR: { name: "瞻博网络", index: "纳斯达克" },
  SBUX: { name: "星巴克", index: "标普500" },
  MCD: { name: "麦当劳", index: "道琼斯、标普500" },
  NKE: { name: "耐克", index: "标普500" },
  DIS: { name: "迪士尼", index: "道琼斯、标普500" },
  PEP: { name: "百事可乐", index: "标普500" },
  KO: { name: "可口可乐", index: "道琼斯、标普500" },
  WMT: { name: "沃尔玛", index: "道琼斯、标普500" },
  TGT: { name: "塔吉特", index: "标普500" },
  HD: { name: "家得宝", index: "道琼斯、标普500" },
  INTC: { name: "英特尔", index: "道琼斯、标普500" },
  QCOM: { name: "高通", index: "纳斯达克100、标普500" },
  AVGO: { name: "博通", index: "纳斯达克100、标普500" },
  TXN: { name: "德州仪器", index: "标普500" },
  KLAC: { name: "科磊半导体", index: "标普500" },
  SNDK: { name: "闪迪", index: "纳斯达克" },
  WDC: { name: "西部数据", index: "纳斯达克" },
  STX: { name: "希捷科技", index: "纳斯达克" },
  NTAP: { name: "网存", index: "纳斯达克" },
  CEG: { name: "星座能源", index: "纽约证交所" },
  VST: { name: "维斯塔能源", index: "纽约证交所" },
  NEE: { name: "新纪元能源", index: "标普500" },
  SO: { name: "南方电力", index: "标普500" },
  DUK: { name: "杜克能源", index: "标普500" },
  AEP: { name: "美国电力", index: "标普500" },
  EXC: { name: "爱克斯龙电力", index: "标普500" },
  OKLO: { name: "Oklo核电", index: "纳斯达克" },
  BWXT: { name: "BWX核电技术", index: "纽约证交所" },
  EQIX: { name: "Equinix数据中心", index: "纳斯达克100" },
  DLR: { name: "Digital Realty", index: "标普500" },
  IRM: { name: "Iron Mountain", index: "标普500" },
  APLD: { name: "Apollo Realty", index: "纽约证交所" },
  NBIS: { name: "Nebius", index: "纳斯达克" },
  ORCL: { name: "甲骨文", index: "标普500、纳斯达克100" }
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

  const meta = stockMeta[sym] || { name: sym, index: "未收录" };
  document.getElementById('stockName').innerText = \`\${sym} | \${meta.name}\`;
  document.getElementById('stockIndex').innerText = \`收录指数：\${meta.index}\`;
  document.getElementById('newsList').innerHTML = "新闻加载中...";

  loadNewsAsync(sym);

  const res = await fetch('/api?symbol=' + sym);
  const data = await res.json();
  renderSignals(data);
  renderChart(sym, data);
}

// ====================== 前端请求后端 /news，不带KEY ======================
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
      el.innerHTML = "暂无新闻";
    }
  } catch (e) {
    document.getElementById('newsList').innerHTML = "新闻加载失败";
  }
}

function renderSignals(data) {
  const sigEl = document.getElementById('signalList');
  sigEl.innerHTML = '';
  const sigs = [];
  data.buyPoints?.forEach(d => sigs.push({date:d, type:'BUY'}));
  data.sellPoints?.forEach(d => sigs.push({date:d, type:'SELL'}));
  
  if (sigs.length === 0) {
    sigEl.innerHTML = '<p style="color:#aaa;">暂无买卖信号</p>';
    return;
  }

  sigs.sort((a,b) => new Date(b.date) - new Date(a.date));
  sigs.forEach(s => {
    const row = document.createElement('div');
    row.className = 'signal-row';
    row.innerHTML = \`
      <span class="signal-date">\${s.date}</span>
      <span class="signal-strategy">综合策略</span>
      <span class="\${s.type==='BUY'?'signal-action-buy':'signal-action-sell'}">
        \${s.type==='BUY'?'买入':'卖出'}
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
          label: \`\${sym} 收盘价\`,
          data: data.dates.map((d, i) => ({ x: d, y: data.closes[i] })),
          borderColor: '#00d1ff',
          borderWidth: 2,
          pointRadius: 0,
          fill: true,
          backgroundColor: 'rgba(0,209,255,0.1)'
        },
        {
          type: 'scatter', label: '买入',
          data: data.buyPoints.map(d => ({ x: d, y: data.closes[data.dates.indexOf(d)] })),
          backgroundColor: 'red', pointStyle: 'triangle', rotation: 180, radius: 8
        },
        {
          type: 'scatter', label: '卖出',
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
</script>
</body>
</html>
`;
