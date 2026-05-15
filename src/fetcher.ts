import { FileSystem } from "./file-system";

type DataLine = string;
type Env = { DB: D1Database };

const MAX_CACHE_LINES = 300;
const D1_BATCH_SIZE = 100;

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

  const limitedLines = lines.slice(-MAX_CACHE_LINES);

  await fs.write(symbol, "data", limitedLines);
  await fs.write(symbol, "signal", []);

  await saveToD1(symbol, lines, env.DB);

  console.log(`[FETCH] ${symbol} 完成 → KV(${limitedLines.length}条) + D1(${lines.length}条)`);
}

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

async function fetchAlpha(symbol: string, key): Promise<DataLine[] | null> {
  if (!key) return null;
  try {
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&apikey=${key}`;
    const res = await fetch(url);
    const data = await res.json();
    const ts = data["Time Series (Daily)"];
    if (!ts) return null;
    return Object.entries(ts).sort((a, b) => a[0].localeCompare(b[0])).map(([d, v]) =>
      `${d},${v["1. open"]},${v["2. high"]},${v["3. low"]},${v["4. close"]},${v["5. volume"]}`
    );
  } catch (e) {
    return null;
  }
}

async function saveToD1(symbol: string, lines: DataLine[], db: D1Database) {
  try {
    for (let i = 0; i < lines.length; i += D1_BATCH_SIZE) {
      const chunk = lines.slice(i, i + D1_BATCH_SIZE);
      const stmts = chunk.map(line => {
        const [date, open, high, low, close, volume] = line.split(",");
        return db.prepare(`
          INSERT OR REPLACE INTO stock_daily (symbol, date, open, high, low, close, volume)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(
          symbol, date, parseFloat(open), parseFloat(high), parseFloat(low), parseFloat(close), parseFloat(volume)
        );
      });
      await db.batch(stmts);

      if (i + D1_BATCH_SIZE < lines.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    }
    console.log(`[D1] ${symbol} 写入完成，共 ${lines.length} 条`);
  } catch (e) {
    console.error(`[D1] ${symbol} 写入失败:`, e);
  }
}

async function fetchTwelveLast7Days(symbol: string, key: string): Promise<DataLine[] | null> {
  if (!key) return null;
  try {
    const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=1day&outputsize=30&apikey=${key}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status !== "ok" || !data.values) return null;

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const cutoff = sevenDaysAgo.toISOString().split("T")[0];

    const lines = data.values
      .map((v) => `${v.datetime},${v.open},${v.high},${v.low},${v.close},${v.volume}`)
      .reverse()
      .filter(line => line.split(",")[0] >= cutoff);

    return lines;
  } catch (e) {
    console.error(`[FETCH-7D] Twelve API error for ${symbol}:`, e);
    return null;
  }
}

async function fetchAlphaLast7Days(symbol: string, key): Promise<DataLine[] | null> {
  if (!key) return null;
  try {
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&apikey=${key}&outputsize=compact`;
    const res = await fetch(url);
    const data = await res.json();
    const ts = data["Time Series (Daily)"];
    if (!ts) return null;

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const cutoff = sevenDaysAgo.toISOString().split("T")[0];

    return Object.entries(ts)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([d, v]) =>
        `${d},${v["1. open"]},${v["2. high"]},${v["3. low"]},${v["4. close"]},${v["5. volume"]}`
      )
      .filter(line => line.split(",")[0] >= cutoff);
  } catch (e) {
    console.error(`[FETCH-7D] Alpha API error for ${symbol}:`, e);
    return null;
  }
}

export async function updateStockLast7Days(
  symbol: string,
  keys: { twelveData: string; alphaVantage: string },
  fs: FileSystem,
  env: Env
): Promise<void> {
  console.log(`[FETCH-7D] ${symbol} 开始拉取【最近7天增量数据】`);

  let lines = await fetchTwelveLast7Days(symbol, keys.twelveData);
  if (!lines || lines.length === 0) {
    lines = await fetchAlphaLast7Days(symbol, keys.alphaVantage);
  }

  if (!lines || lines.length === 0) {
    console.error(`[FETCH-7D] ${symbol} 7天数据拉取失败`);
    return;
  }

  const oldLines = await fs.read(symbol, "data");
  const dataMap = new Map();

  for (const line of oldLines) {
    const date = line.split(",")[0];
    dataMap.set(date, line);
  }

  for (const line of lines) {
    const date = line.split(",")[0];
    const newVolume = parseInt(line.split(",")[5], 10) || 0;
    const existing = dataMap.get(date);
    if (existing) {
      const oldVolume = parseInt(existing.split(",")[5], 10) || 0;
      if (newVolume >= oldVolume) {
        dataMap.set(date, line);
      }
    } else {
      dataMap.set(date, line);
    }
  }

  const mergedLines = Array.from(dataMap.values()).sort((a, b) => {
    return a.split(",")[0].localeCompare(b.split(",")[0]);
  });

  const finalLines = mergedLines.slice(-MAX_CACHE_LINES);

  await fs.write(symbol, "data", finalLines);

  await saveToD1(symbol, lines, env.DB);

  console.log(`[FETCH-7D] ${symbol} 【最近7天】合并更新完成 → KV(${finalLines.length}条) + D1(${lines.length}条)`);
}
