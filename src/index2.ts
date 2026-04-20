import { Env } from "./env";
import { ALL_STOCKS } from "./stock-list";
import { FileSystem } from "./file-system";
import { updateStock } from "./fetcher";
import { HTML_CONTENT } from "./html-content";
import { calculateAllSignals } from "./strategy";

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

    // 单只加载：自动计算 + 保存信号
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

        // 读取数据
        const data = await fs.read(upper, "data");
        const dates: string[] = [];
        const closes: number[] = [];
        for (const line of data) {
          const p = line.split(",");
          dates.push(p[0]);
          closes.push(parseFloat(p[4]));
        }

        // 计算信号并保存
        const signals = calculateAllSignals(dates, closes);
        const sigLines: string[] = [];
        signals.buyPoints.forEach(d => sigLines.push(`${d},BUY`));
        signals.sellPoints.forEach(d => sigLines.push(`${d},SELL`));
        await fs.write(upper, "signal", sigLines);

        const cnt = data.length;
        return Response.json({ ok: true, symbol: upper, data_line_count: cnt, signals: sigLines.length });
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

    // ✅ 核心修复：API 接口优先缓存，无缓存自动计算 + 写入
    if (url.pathname === "/api") {
      try {
        const symbol = (url.searchParams.get("symbol") || "NVDA").toUpperCase();
        if (!ALL_STOCKS.includes(symbol)) {
          return Response.json({ error: "invalid symbol" }, { status: 400 });
        }
        
        const fs = new FileSystem(env.STOCK_DB);
        const data = await fs.read(symbol, "data");
        let signalLines = await fs.read(symbol, "signal");
        
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

        let buyPoints: string[] = [];
        let sellPoints: string[] = [];

        // --- ✅ 关键逻辑：有信号用信号，没有就计算并写入 ---
        if (signalLines && signalLines.length > 0) {
          // 使用缓存
          for (const line of signalLines) {
            const trim = line.trim();
            if (!trim) continue;
            const sp = trim.split(",");
            if (sp.length < 2) continue;
            if (sp[1] === "BUY") buyPoints.push(sp[0]);
            else if (sp[1] === "SELL") sellPoints.push(sp[0]);
          }
        } else {
          // 无信号：实时计算
          const signals = calculateAllSignals(dates, closes);
          buyPoints = signals.buyPoints;
          sellPoints = signals.sellPoints;

          // 写入 KV 缓存
          const newSigLines: string[] = [];
          buyPoints.forEach(d => newSigLines.push(`${d},BUY`));
          sellPoints.forEach(d => newSigLines.push(`${d},SELL`));
          await fs.write(symbol, "signal", newSigLines);
        }

        return Response.json({
          symbol, dates, closes, buyPoints, sellPoints
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

  // 批次执行（自动计算信号）
  async runBatch(list: string[], env: Env, name: string) {
    const fs = new FileSystem(env.STOCK_DB);
    let success = 0;
    for (const sym of list) {
      try {
        await updateStock(sym, {
          twelveData: env.TWELVEDATA_API_KEY,
          alphaVantage: env.ALPHA_VANTAGE_API_KEY,
        }, fs, env);

        // 批量加载时也自动计算信号
        const data = await fs.read(sym, "data");
        const dates: string[] = [];
        const closes: number[] = [];
        for (const line of data) {
          const p = line.split(",");
          dates.push(p[0]);
          closes.push(parseFloat(p[4]));
        }
        const signals = calculateAllSignals(dates, closes);
        const sigLines: string[] = [];
        signals.buyPoints.forEach(d => sigLines.push(`${d},BUY`));
        signals.sellPoints.forEach(d => sigLines.push(`${d},SELL`));
        await fs.write(sym, "signal", sigLines);

        success++;
        console.log(`[${name}] 成功: ${sym} 信号数: ${sigLines.length}`);
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
