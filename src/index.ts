import { Env } from "./env";
import { ALL_STOCKS } from "./stock-list";
import { FileSystem } from "./file-system";
import { updateStock, updateStockLast7Days, initDatabase } from "./fetcher";
import { HTML_CONTENT_V2 } from "./html-content";
import { calculateStrategyV4 } from "./strategy-v4";

const MAX_DATA_LENGTH = 300;

const BATCH_SIZE = 3;
const BATCHES: string[][] = [];
for (let i = 0; i < ALL_STOCKS.length; i += BATCH_SIZE) {
  BATCHES.push(ALL_STOCKS.slice(i, i + BATCH_SIZE));
}

const BATCH_1 = ALL_STOCKS.slice(0, 33);
const BATCH_2 = ALL_STOCKS.slice(33);

const ALLOWED_ORIGINS = [
  "https://ustock.pages.dev",
  "https://ustock.chengchenglonglong.workers.dev"
];

const setCorsHeaders = (headers: Headers, request?: Request) => {
  const origin = request?.headers.get("Origin") || "";
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  headers.set("Access-Control-Allow-Origin", allowOrigin);
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Access-Control-Max-Age", "86400");
};

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    const responseHeaders = new Headers();
    setCorsHeaders(responseHeaders, request);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: responseHeaders });
    }

    if (url.pathname === "/") {
      responseHeaders.set("Content-Type", "text/html; charset=utf-8");
      return new Response(HTML_CONTENT_V2, { headers: responseHeaders });
    }

    if (url.pathname === "/load") {
      try {
        const symbol = url.searchParams.get("symbol");
        if (!symbol) return new Response(JSON.stringify({ ok: false, error: "缺少 symbol" }), { headers: responseHeaders });
        const upper = symbol.toUpperCase();
        if (!ALL_STOCKS.includes(upper)) return new Response(JSON.stringify({ ok: false, error: "不在白名单" }), { headers: responseHeaders });

        const fs = new FileSystem(env.STOCK_DB);
        await updateStock(upper, {
          twelveData: env.TWELVEDATA_API_KEY,
          alphaVantage: env.ALPHA_VANTAGE_API_KEY,
        }, fs, env);

        const cnt = (await fs.read(upper, "data")).length;
        return new Response(JSON.stringify({ ok: true, symbol: upper, data_line_count: cnt }), { headers: responseHeaders });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e) }), { headers: responseHeaders });
      }
    }

    if (url.pathname === "/load/recent7days") {
      try {
        const symbol = url.searchParams.get("symbol");
        if (!symbol) return new Response(JSON.stringify({ ok: false, error: "缺少 symbol" }), { headers: responseHeaders });
        const upper = symbol.toUpperCase();
        if (!ALL_STOCKS.includes(upper)) return new Response(JSON.stringify({ ok: false, error: "不在白名单" }), { headers: responseHeaders });

        const fs = new FileSystem(env.STOCK_DB);
        await updateStockLast7Days(upper, {
          twelveData: env.TWELVEDATA_API_KEY,
          alphaVantage: env.ALPHA_VANTAGE_API_KEY,
        }, fs, env);

        const cnt = (await fs.read(upper, "data")).length;
        return new Response(JSON.stringify({ ok: true, symbol: upper, data_line_count: cnt }), { headers: responseHeaders });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e) }), { headers: responseHeaders });
      }
    }

    if (url.pathname === "/load-batch1") {
      const result = await this.runBatch(BATCH_1, env, "批次1");
      const batchHeaders = new Headers(result.headers);
      setCorsHeaders(batchHeaders, request);
      return new Response(result.body, { headers: batchHeaders, status: result.status });
    }

    if (url.pathname === "/load-batch2") {
      const result = await this.runBatch(BATCH_2, env, "批次2");
      const batchHeaders = new Headers(result.headers);
      setCorsHeaders(batchHeaders, request);
      return new Response(result.body, { headers: batchHeaders, status: result.status });
    }

    if (url.pathname === "/load-full") {
      try {
        const executionResult = await this.executeNextBatch(env, "全量刷新", true);

        return Response.json({
          ok: true,
          currentIndex: executionResult.currentIndex,
          subIndex: executionResult.subIndex,
          nextIndex: executionResult.nextIndex,
          nextSubIndex: executionResult.nextSubIndex,
          symbol: executionResult.symbol,
          result: executionResult.result
        });
      } catch (e) {
        return Response.json({ ok: false, error: String(e) });
      }
    }

    if (url.pathname === "/api") {
      try {
        const symbol = (url.searchParams.get("symbol") || "NVDA").toUpperCase();
        if (!ALL_STOCKS.includes(symbol)) {
          return new Response(JSON.stringify({ error: "invalid symbol" }), { headers: responseHeaders, status: 400 });
        }

        const fs = new FileSystem(env.STOCK_DB);
        const data = await fs.read(symbol, "data");

        const dates:   string[] = [];
        const opens:   number[] = [];
        const highs:   number[] = [];
        const lows:    number[] = [];
        const closes:  number[] = [];
        const volumes: number[] = [];

        for (const line of data) {
          const parts = line.split(",");
          if (parts.length >= 6) {
            dates.push(parts[0]);
            opens.push(parseFloat(parts[1])  || 0);
            highs.push(parseFloat(parts[2])  || 0);
            lows.push(parseFloat(parts[3])   || 0);
            closes.push(parseFloat(parts[4]) || 0);
            volumes.push(parseFloat(parts[5]) || 0);
          }
        }

        const finalDates   = dates.slice(-MAX_DATA_LENGTH);
        const finalOpens   = opens.slice(-MAX_DATA_LENGTH);
        const finalHighs   = highs.slice(-MAX_DATA_LENGTH);
        const finalLows    = lows.slice(-MAX_DATA_LENGTH);
        const finalCloses  = closes.slice(-MAX_DATA_LENGTH);
        const finalVolumes = volumes.slice(-MAX_DATA_LENGTH);

        const strategyResult = calculateStrategyV4(finalDates, finalCloses, finalVolumes, finalHighs, finalLows);

        return new Response(JSON.stringify({
          symbol,
          dates:   finalDates,
          opens:   finalOpens,
          highs:   finalHighs,
          lows:    finalLows,
          closes:  finalCloses,
          volumes: finalVolumes,
          trend:         strategyResult.trend,
          trendStrength: strategyResult.trendStrength,
          indicators:    strategyResult.indicators || {},
          strategies:    strategyResult
        }), { headers: responseHeaders });

      } catch (err) {
        console.error("API错误:", err);
        return new Response(JSON.stringify({
          symbol: (url.searchParams.get("symbol") || "NVDA").toUpperCase(),
          dates: [], opens: [], highs: [], lows: [],
          closes: [], volumes: [],
          trend: "nodata", trendStrength: "unknown",
          indicators: {},
          strategies: {}
        }), { headers: responseHeaders });
      }
    }

    if (url.pathname === "/scheduled") {
      try {
        const fs = new FileSystem(env.STOCK_DB);
        const mode = await fs.get("update_mode") || "incremental";
        const executionResult = await this.executeNextBatch(env, "手动批次", mode === "full");
        return new Response(JSON.stringify({
          ok: true,
          mode,
          currentIndex: executionResult.currentIndex,
          subIndex: executionResult.subIndex,
          nextIndex:    executionResult.nextIndex,
          nextSubIndex: executionResult.nextSubIndex,
          symbol: executionResult.symbol,
          result:       executionResult.result
        }), { headers: responseHeaders });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e) }), { headers: responseHeaders });
      }
    }

    if (url.pathname === "/set-mode") {
      try {
        const mode = url.searchParams.get("mode");
        if (mode !== "full" && mode !== "incremental") {
          return new Response(JSON.stringify({ ok: false, error: "mode 只能是 full 或 incremental" }), { headers: responseHeaders });
        }
        const fs = new FileSystem(env.STOCK_DB);
        await fs.put("update_mode", mode);
        return new Response(JSON.stringify({ ok: true, mode }), { headers: responseHeaders });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e) }), { headers: responseHeaders });
      }
    }

    if (url.pathname === "/reset-index") {
      try {
        const fs = new FileSystem(env.STOCK_DB);
        await fs.putNumber("current_batch_index", 0);
        await fs.putNumber("current_sub_index", 0);
        await fs.putNumber("full_batch_index", 0);
        await fs.putNumber("full_sub_index", 0);
        return new Response(JSON.stringify({ ok: true, message: "索引已重置" }), { headers: responseHeaders });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e) }), { headers: responseHeaders });
      }
    }

    return new Response("Not found", { headers: responseHeaders, status: 404 });
  },

  async runBatch(list: string[], env: Env, name: string) {
    const fs = new FileSystem(env.STOCK_DB);
    let success = 0;
    for (const sym of list) {
      try {
        await updateStockLast7Days(sym, {
          twelveData: env.TWELVEDATA_API_KEY,
          alphaVantage: env.ALPHA_VANTAGE_API_KEY,
        }, fs, env);
        success++;
        console.log(`[${name}] 成功: ${sym}`);
      } catch (e) {
        console.log(`[${name}] 失败: ${sym}`, e);
      }
    }
    const responseHeaders = new Headers();
    setCorsHeaders(responseHeaders);
    return new Response(JSON.stringify({ batch: name, total: list.length, success }), { headers: responseHeaders });
  },

  async executeNextBatch(env: Env, batchNamePrefix: string, fullUpdate = false) {
    const fs = new FileSystem(env.STOCK_DB);
    const indexKey = fullUpdate ? "full_batch_index" : "current_batch_index";
    const subIndexKey = fullUpdate ? "full_sub_index" : "current_sub_index";

    let currentIndex = await fs.getNumber(indexKey) || 0;
    let subIndex = await fs.getNumber(subIndexKey) || 0;

    if (currentIndex >= BATCHES.length) {
      currentIndex = 0;
      subIndex = 0;
    }

    const batch = BATCHES[currentIndex];
    if (!batch) {
      currentIndex = 0;
      subIndex = 0;
    }

    if (subIndex >= BATCHES[currentIndex].length) {
      subIndex = 0;
    }

    const sym = BATCHES[currentIndex][subIndex];
    let success = 0;

    try {
      if (fullUpdate) {
        await updateStock(sym, {
          twelveData: env.TWELVEDATA_API_KEY,
          alphaVantage: env.ALPHA_VANTAGE_API_KEY,
        }, fs, env);
      } else {
        await updateStockLast7Days(sym, {
          twelveData: env.TWELVEDATA_API_KEY,
          alphaVantage: env.ALPHA_VANTAGE_API_KEY,
        }, fs, env);
      }
      success = 1;
      console.log(`[${batchNamePrefix} ${currentIndex + 1}-${subIndex + 1}] 成功: ${sym}`);
    } catch (e) {
      console.log(`[${batchNamePrefix} ${currentIndex + 1}-${subIndex + 1}] 失败: ${sym}`, e);
    }

    let nextSubIndex = subIndex + 1;
    let nextIndex = currentIndex;

    if (nextSubIndex >= BATCHES[currentIndex].length) {
      nextSubIndex = 0;
      nextIndex = (currentIndex + 1) % BATCHES.length;
    }

    await fs.putNumber(indexKey, nextIndex);
    await fs.putNumber(subIndexKey, nextSubIndex);

    return {
      currentIndex,
      subIndex,
      nextIndex,
      nextSubIndex,
      symbol: sym,
      result: { batch: `${batchNamePrefix} ${currentIndex + 1}-${subIndex + 1}`, total: 1, success }
    };
  },

  async scheduled(event: ScheduledEvent, env: Env) {
    try {
      const fs = new FileSystem(env.STOCK_DB);
      const mode = await fs.get("update_mode") || "incremental";
      await this.executeNextBatch(env, "自动批次", mode === "full");
    } catch (e) {
      console.error("[scheduled] 定时任务执行失败:", e);
    }
  }
};
