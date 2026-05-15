// strategy-v2.ts — 增强版组合策略
// 三层架构：趋势定性 → 信号生成 → 成交量确认 + 共振过滤
// 策略：MA / RSI(Wilder) / MACD / BOLL / Divergence / Combo / ATR止损

export function calculateStrategyV2(
  dates: string[],
  closes: number[],
  volumes: number[] = []
) {
  const dataLen = closes.length;
  if (dataLen < 120) {
    return {
      trend: "insufficient_data",
      trendStrength: "unknown",
      MA: { buy: [], sell: [] },
      RSI: { buy: [], sell: [] },
      MACD: { buy: [], sell: [] },
      BOLL: { buy: [], sell: [] },
      Divergence: { buy: [], sell: [] },
      Combo: { buy: [], sell: [] },
      atrStops: {}
    };
  }

  // ===================== 1. EMA三线趋势判断（五档）
  const ema20  = calcEMA(closes, 20);
  const ema60  = calcEMA(closes, 60);
  const ema120 = calcEMA(closes, 120);
  const lastClose  = closes[closes.length - 1];
  const lastEma20  = ema20[ema20.length - 1];
  const lastEma60  = ema60[ema60.length - 1];
  const lastEma120 = ema120[ema120.length - 1];

  // 五档趋势
  let trend = "neutral";
  let trendStrength = "weak";
  if (lastEma20 > lastEma60 && lastEma60 > lastEma120 && lastClose > lastEma20) {
    trend = "uptrend"; trendStrength = "strong";       // 强上涨：三线多头排列
  } else if (lastEma20 > lastEma60 && lastClose > lastEma60) {
    trend = "uptrend"; trendStrength = "weak";         // 弱上涨：EMA20>EMA60但未完全排列
  } else if (lastEma20 < lastEma60 && lastEma60 < lastEma120 && lastClose < lastEma20) {
    trend = "downtrend"; trendStrength = "strong";     // 强下跌：三线空头排列
  } else if (lastEma20 < lastEma60 && lastClose < lastEma60) {
    trend = "downtrend"; trendStrength = "weak";       // 弱下跌
  } else {
    trend = "neutral"; trendStrength = "weak";         // 震荡
  }

  // ===================== 2. 成交量20日均量（用于信号强弱过滤）
  const volMA20 = calcVolMA(volumes, 20);

  // ===================== 3. 各策略信号生成
  const MA         = calcMA_Signal(dates, closes, ema20, ema60);
  const RSI        = calcRSI_Signal(dates, closes);
  const MACD       = calcMACD_Signal(dates, closes);
  const BOLL       = calcBOLL_Signal(dates, closes);
  const Divergence = calcDivergence_Signal(dates, closes);

  // ===================== 4. 趋势过滤（非对称）
  const filtered = {
    MA:         filterByTrend(MA, trend),
    RSI:        filterByTrend(RSI, trend),
    MACD:       filterByTrend(MACD, trend),
    BOLL:       filterByTrend(BOLL, trend),
    Divergence: filterByTrend(Divergence, trend),
  };

  // ===================== 5. 成交量升降级
  const withVol = {
    MA:         applyVolFilter(filtered.MA, dates, volumes, volMA20),
    RSI:        applyVolFilter(filtered.RSI, dates, volumes, volMA20),
    MACD:       applyVolFilter(filtered.MACD, dates, volumes, volMA20),
    BOLL:       applyVolFilter(filtered.BOLL, dates, volumes, volMA20),
    Divergence: applyVolFilter(filtered.Divergence, dates, volumes, volMA20),
  };

  // ===================== 6. Combo：同一天≥2个策略共振
  const Combo = calcCombo(dates, [
    withVol.MA,
    withVol.RSI,
    withVol.MACD,
    withVol.BOLL,
    withVol.Divergence,
  ], 2);

  // ===================== 7. ATR止损参考（14日ATR，1.5倍）
  // 这里closes作为简化ATR（真实ATR需要high/low，用日收益波动代替）
  const atrStops = calcATRStops(dates, closes, Combo.buy);

  return {
    trend,
    trendStrength,
    ...withVol,
    Combo,
    atrStops
  };
}

// ===================== EMA
function calcEMA(v: number[], p: number): number[] {
  const k = 2 / (p + 1);
  const res: number[] = [v[0]];
  for (let i = 1; i < v.length; i++) {
    res.push(v[i] * k + res[i - 1] * (1 - k));
  }
  return res;
}

// ===================== 简单MA
function calcSMA(values: number[], period: number): number[] {
  const res: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { res.push(0); continue; }
    const sum = values.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    res.push(sum / period);
  }
  return res;
}

// ===================== RSI — Wilder平滑法（更准确）
function calcRSI_Wilder(closes: number[], period: number): number[] {
  const rsi: number[] = new Array(period).fill(0);
  let avgGain = 0;
  let avgLoss = 0;

  // 初始化：第一个周期的平均涨跌
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff;
    else avgLoss += Math.abs(diff);
  }
  avgGain /= period;
  avgLoss /= period;
  rsi.push(100 - 100 / (1 + avgGain / (avgLoss || 0.001)));

  // Wilder平滑
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    rsi.push(100 - 100 / (1 + avgGain / (avgLoss || 0.001)));
  }
  return rsi;
}

// ===================== 成交量均线
function calcVolMA(volumes: number[], period: number): number[] {
  if (!volumes || volumes.length === 0) return [];
  return calcSMA(volumes, period);
}

// ===================== 趋势过滤（非对称：上涨只保留买，下跌只保留卖，震荡两者都保留）
function filterByTrend(
  signal: { buy: string[]; sell: string[] },
  trend: string
): { buy: string[]; sell: string[] } {
  if (trend === "uptrend")   return { buy: signal.buy, sell: [] };
  if (trend === "downtrend") return { buy: [], sell: signal.sell };
  return signal; // neutral：高抛低吸，两者都保留
}

// ===================== 成交量过滤：仅保留量能放大的信号（volumes为空则跳过）
function applyVolFilter(
  signal: { buy: string[]; sell: string[] },
  dates: string[],
  volumes: number[],
  volMA20: number[]
): { buy: string[]; sell: string[] } {
  if (!volumes || volumes.length === 0 || volMA20.length === 0) return signal;

  const volMap: Record<string, boolean> = {};
  dates.forEach((d, i) => {
    if (i >= 20 && volMA20[i] > 0) {
      volMap[d] = volumes[i] >= volMA20[i] * 1.2;
    }
  });

  return {
    buy:  signal.buy.filter(d => volMap[d] !== false),
    sell: signal.sell.filter(d => volMap[d] !== false),
  };
}

// ===================== MA策略：EMA20/EMA60金叉死叉 + MA5/MA20短线
function calcMA_Signal(
  dates: string[],
  closes: number[],
  ema20: number[],
  ema60: number[]
): { buy: string[]; sell: string[] } {
  const buy: string[] = [];
  const sell: string[] = [];
  const ma5 = calcSMA(closes, 5);

  for (let i = 60; i < closes.length; i++) {
    // 短线：MA5上穿MA20
    if (ma5[i - 1] < ema20[i - 1] && ma5[i] > ema20[i]) buy.push(dates[i]);
    // 短线：MA5下穿MA20
    if (ma5[i - 1] > ema20[i - 1] && ma5[i] < ema20[i]) sell.push(dates[i]);
    // 趋势：EMA20上穿EMA60（金叉）
    if (ema20[i - 1] < ema60[i - 1] && ema20[i] > ema60[i]) buy.push(dates[i]);
    // 趋势：EMA20下穿EMA60（死叉）
    if (ema20[i - 1] > ema60[i - 1] && ema20[i] < ema60[i]) sell.push(dates[i]);
  }

  // 去重
  return { buy: [...new Set(buy)], sell: [...new Set(sell)] };
}

// ===================== RSI策略：Wilder平滑 + 动态阈值
function calcRSI_Signal(
  dates: string[],
  closes: number[]
): { buy: string[]; sell: string[] } {
  const buy: string[] = [];
  const sell: string[] = [];
  const rsi = calcRSI_Wilder(closes, 14);

  for (let i = 15; i < closes.length; i++) {
    const ri = i - 14; // rsi数组偏移
    if (ri < 1 || ri >= rsi.length) continue;
    // 从超卖区回升（穿越35，比简单<30更早捕捉）
    if (rsi[ri - 1] < 35 && rsi[ri] >= 35) buy.push(dates[i]);
    // 从超买区回落（穿越65）
    if (rsi[ri - 1] > 65 && rsi[ri] <= 65) sell.push(dates[i]);
  }
  return { buy, sell };
}

// ===================== MACD策略：柱状图由负转正/由正转负
function calcMACD_Signal(
  dates: string[],
  closes: number[]
): { buy: string[]; sell: string[] } {
  const buy: string[] = [];
  const sell: string[] = [];
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = calcEMA(macdLine, 9);
  const histogram = macdLine.map((v, i) => v - signalLine[i]);

  for (let i = 1; i < histogram.length; i++) {
    // 柱状图由负转正：动量转多
    if (histogram[i - 1] < 0 && histogram[i] >= 0) buy.push(dates[i]);
    // 柱状图由正转负：动量转空
    if (histogram[i - 1] > 0 && histogram[i] <= 0) sell.push(dates[i]);
  }
  return { buy, sell };
}

// ===================== BOLL策略：下轨反弹+站上中轨 / 上轨回落
function calcBOLL_Signal(
  dates: string[],
  closes: number[]
): { buy: string[]; sell: string[] } {
  const buy: string[] = [];
  const sell: string[] = [];

  for (let i = 21; i < closes.length; i++) {
    const slice = closes.slice(i - 20, i);
    const mid = slice.reduce((a, b) => a + b, 0) / 20;
    const std = Math.sqrt(slice.reduce((s, v) => s + (v - mid) ** 2, 0) / 20);
    const upper = mid + 2 * std;
    const lower = mid - 2 * std;

    const prev = closes[i - 1];
    const curr = closes[i];

    // 前一天在下轨以下，今天回升站上下轨（反弹确认）
    if (prev < lower && curr >= lower) buy.push(dates[i]);
    // 前一天在上轨以上，今天回落到上轨以下（假突破确认）
    if (prev > upper && curr <= upper) sell.push(dates[i]);
  }
  return { buy, sell };
}

// ===================== Divergence背离检测
// 底背离：价格创新低但RSI未创新低 → 潜在买点
// 顶背离：价格创新高但RSI未创新高 → 潜在卖点
function calcDivergence_Signal(
  dates: string[],
  closes: number[]
): { buy: string[]; sell: string[] } {
  const buy: string[] = [];
  const sell: string[] = [];
  const rsi = calcRSI_Wilder(closes, 14);
  const lookback = 20; // 回看窗口

  for (let i = lookback + 14; i < closes.length; i++) {
    const ri = i - 14;
    if (ri < lookback) continue;

    const priceSlice = closes.slice(i - lookback, i);
    const rsiSlice   = rsi.slice(ri - lookback, ri);
    const currPrice  = closes[i];
    const currRsi    = rsi[ri];

    const minPrice = Math.min(...priceSlice);
    const minRsi   = Math.min(...rsiSlice);
    const maxPrice = Math.max(...priceSlice);
    const maxRsi   = Math.max(...rsiSlice);

    // 底背离：价格低于近期低点，RSI却高于近期RSI低点
    if (currPrice < minPrice * 1.01 && currRsi > minRsi * 1.05 && currRsi < 45) {
      buy.push(dates[i]);
    }
    // 顶背离：价格高于近期高点，RSI却低于近期RSI高点
    if (currPrice > maxPrice * 0.99 && currRsi < maxRsi * 0.95 && currRsi > 55) {
      sell.push(dates[i]);
    }
  }
  return { buy, sell };
}

// ===================== Combo共振：同一天≥threshold个策略同向信号
function calcCombo(
  dates: string[],
  signals: Array<{ buy: string[]; sell: string[] }>,
  threshold: number
): { buy: string[]; sell: string[] } {
  const buyCount:  Record<string, number> = {};
  const sellCount: Record<string, number> = {};

  for (const sig of signals) {
    for (const d of sig.buy)  buyCount[d]  = (buyCount[d]  || 0) + 1;
    for (const d of sig.sell) sellCount[d] = (sellCount[d] || 0) + 1;
  }

  const buy  = Object.keys(buyCount).filter(d => buyCount[d]  >= threshold);
  const sell = Object.keys(sellCount).filter(d => sellCount[d] >= threshold);

  // 按日期排序
  buy.sort();
  sell.sort();
  return { buy, sell };
}

// ===================== ATR止损：每个Combo买入点附带止损价
// 简化ATR：用近14日收盘波动均值代替（真实ATR需要high/low）
function calcATRStops(
  dates: string[],
  closes: number[],
  buyDates: string[]
): Record<string, { stopPrice: number; atr: number }> {
  const result: Record<string, { stopPrice: number; atr: number }> = {};
  const dateIndex: Record<string, number> = {};
  dates.forEach((d, i) => { dateIndex[d] = i; });

  for (const d of buyDates) {
    const idx = dateIndex[d];
    if (idx === undefined || idx < 14) continue;

    // 计算14日真实波幅（简化版：用相邻收盘价差的均值）
    let atrSum = 0;
    for (let i = idx - 13; i <= idx; i++) {
      atrSum += Math.abs(closes[i] - closes[i - 1]);
    }
    const atr = atrSum / 14;
    const stopPrice = closes[idx] - 1.5 * atr;

    result[d] = {
      stopPrice: Math.round(stopPrice * 100) / 100,
      atr: Math.round(atr * 100) / 100
    };
  }
  return result;
}
