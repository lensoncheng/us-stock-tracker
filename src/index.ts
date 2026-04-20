import { Env } from "./env";
import { ALL_STOCKS } from "./stock-list";
import { FileSystem } from "./file-system";
import { updateStock } from "./fetcher";
import { HTML_CONTENT } from "./html-content";
import { calculateAllSignals } from "./strategy";

// ===================== 可配置：最大返回数据条数（改这里就行）
const MAX_DATA_LENGTH = 100;

// 固定拆分 2 批
const BATCH_1 = ALL_STOCKS.slice(0, 33);
const BATCH_2 = ALL_STOCKS.slice(33);

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    // 首页
    if (url.pathname === "/") {
      return new Response(HTML_CONTENT, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // 单只加载
    if (url.pathname === "/load") {
      try {
        const symbol = url.searchParams.get("symbol");
        if (!symbol) return Response.json({ ok: false, error: "缺少 symbol" });
        const upper = symbol.toUpperCase();
        if (!ALL_STOCKS.includes(upper)) return Response.json({ ok: false, error: "不在白名单" });

        const fs = new FileSystem(env.STOCK_DB);
        await updateStock(upper, {
          twelveData: env.TWELVEDATA_API_KEY,
          alphaVantage: env.ALPHA_VANTAGE_API_KEY,
        }, fs, env);

        const cnt = (await fs.read(upper, "data")).length;
        return Response.json({ ok: true, symbol: upper, data_line_count: cnt });
      } catch (e) {
        return Response.json({ ok: false, error: String(e) });
      }
    }

    // 批次1：前33只
    if (url.pathname === "/load-batch1") {
      return this.runBatch(BATCH_1, env, "批次1");
    }

    // 批次2：后33只
    if (url.pathname === "/load-batch2") {
      return this.runBatch(BATCH_2, env, "批次2");
    }

    // ===================== 只在这里修改：API 接口截断数据
    if (url.pathname === "/api") {
      try {
        const symbol = (url.searchParams.get("symbol") || "NVDA").toUpperCase();
        if (!ALL_STOCKS.includes(symbol)) {
          return Response.json({ error: "invalid symbol" }, { status: 400 });
        }
        
        const fs = new FileSystem(env.STOCK_DB);
        const data = await fs.read(symbol, "data");
        const signalLines = await fs.read(symbol, "signal");
        
        // 解析数据
        const dates = [];
        const closes = [];
        for (const line of data) {
          const parts = line.split(",");
          if (parts.length >= 5) {
            dates.push(parts[0]);
            closes.push(parseFloat(parts[4]) || 0);
          }
        }

        // 解析信号
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

        // ===================== 核心截断逻辑（最小改动，不破坏结构）
        const finalDates = dates.slice(-MAX_DATA_LENGTH);
        const finalCloses = closes.slice(-MAX_DATA_LENGTH);
        const dateSet = new Set(finalDates);

        const finalBuy = buyPoints.filter(d => dateSet.has(d));
        const finalSell = sellPoints.filter(d => dateSet.has(d));

        // 返回截断后的数据
        return Response.json({
          symbol,
          dates: finalDates,
          closes: finalCloses,
          buyPoints: finalBuy,
          sellPoints: finalSell
        });

      } catch (err) {
        console.error("API错误:", err);
        return Response.json({
          symbol: symbol || "NVDA", dates: [], closes: [], buyPoints: [], sellPoints: []
        });
      }
    }

    return new Response("Not found", { status: 404 });
  },

  // 批次执行
  async runBatch(list: string[], env: Env, name: string) {
    const fs = new FileSystem(env.STOCK_DB);
    let success = 0;
    for (const sym of list) {
      try {
        await updateStock(sym, {
          twelveData: env.TWELVEDATA_API_KEY,
          alphaVantage: env.ALPHA_VANTAGE_API_KEY,
        }, fs, env);
        success++;
        console.log(`[${name}] 成功: ${sym}`);
      } catch (e) {
        console.log(`[${name}] 失败: ${sym}`, e);
      }
      await new Promise(r => setTimeout(r, 30000));
    }
    return Response.json({ batch: name, total: list.length, success });
  },

  // Cron 定时
  async scheduled(event: ScheduledEvent, env: Env) {
    await this.runBatch(BATCH_1, env, "定时批次1");
  }
};
