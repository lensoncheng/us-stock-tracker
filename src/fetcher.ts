import { FileSystem } from "./file-system";

type DataLine = string;
type Env = { DB: D1Database };

// 初始化数据库（建表）
export async function initDatabase(db: D1Database) {
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS stock_daily (
        symbol TEXT,
        date TEXT,
        open REAL,
        high REAL,
        low REAL,
        close REAL,
        volume REAL,
        PRIMARY KEY (symbol, date)
      )
    `);
    console.log("✅ 数据库表初始化成功");
  } catch (e) {
    console.error("建表失败", e);
  }
}

export async function updateStock(
  symbol: string,
  keys: { twelveData: string; alphaVantage: string },
  fs: FileSystem,
  env: Env
): Promise<void> {
  console.log(`[FETCH] ${symbol} 开始拉取`);

  let lines = await fetchTwelve(symbol, keys.twelveData);
  if (!lines || lines.length === 0) {
    console.log(`[FETCH] ${symbol} 主源失败，切换备用源`);
    lines = await fetchAlpha(symbol, keys.alphaVantage);
  }

  if (!lines || lines.length === 0) {
    console.error(`[FETCH] ${symbol} 所有数据源均失败`);
    return;
  }

  // 存入 KV
  await fs.write(symbol, "data", lines);
  await fs.write(symbol, "signal", []);

  // 存入 D1
  await saveToD1(symbol, lines, env.DB);

  console.log(`[FETCH] ${symbol} 完成 → KV + D1 双存储`);
}

// 主数据源 Twelve Data
async function fetchTwelve(symbol: string, key: string): Promise<DataLine[] | null> {
  if (!key) return null;
  try {
    const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=1day&outputsize=500&apikey=${key}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status !== "ok" || !data.values) return null;
    return data.values.map((v: any) => `${v.datetime},${v.open},${v.high},${v.low},${v.close},${v.volume}`).reverse();
  } catch (e) {
    return null;
  }
}

// 备用数据源 Alpha Vantage
async function fetchAlpha(symbol: string, key: string): Promise<DataLine[] | null> {
  if (!key) return null;
  try {
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&apikey=${key}`;
    const res = await fetch(url);
    const data = await res.json();
    const ts = data["Time Series (Daily)"];
    if (!ts) return null;
    return Object.entries(ts).sort((a, b) => a[0].localeCompare(b[0])).map(([d, v]: any) =>
      `${d},${v["1. open"]},${v["2. high"]},${v["3. low"]},${v["4. close"]},${v["5. volume"]}`
    );
  } catch (e) {
    return null;
  }
}

// 保存到 D1
async function saveToD1(symbol: string, lines: DataLine[], db: D1Database) {
  try {
    for (const line of lines) {
      const [date, open, high, low, close, volume] = line.split(",");
      await db.prepare(`
        INSERT OR REPLACE INTO stock_daily (symbol, date, open, high, low, close, volume)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        symbol, date, parseFloat(open), parseFloat(high), parseFloat(low), parseFloat(close), parseFloat(volume)
      ).run();
    }
  } catch (e) {
    console.error("D1 写入失败", e);
  }
}
