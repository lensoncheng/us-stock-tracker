import { calculateStrategyV2 } from "./strategy-v3";

export function calculateStrategyV4(
  dates: string[],
  closes: number[],
  volumes: number[] = [],
  highs: number[] = [],
  lows: number[] = []
) {
  const dataLen = closes.length;
  if (dataLen < 30) {
    return {
      trend: "insufficient_data",
      trendStrength: "unknown",
      MA: { buy: [], sell: [] },
      RSI: { buy: [], sell: [] },
      MACD: { buy: [], sell: [] },
      BOLL: { buy: [], sell: [] },
      Divergence: { buy: [], sell: [] },
      KDJ: { buy: [], sell: [] },
      OBV: { buy: [], sell: [] },
      ADX: { buy: [], sell: [] },
      Combo: { buy: [], sell: [] },
      atrStops: {},
      indicators: {
        ma5: [],
        ema20: [],
        ema60: [],
        bollUpper: [],
        bollMid: [],
        bollLower: [],
        kdjK: [],
        kdjD: [],
        kdjJ: [],
        obv: [],
        adx: [],
        plusDI: [],
        minusDI: [],
      }
    };
  }

  const v3Result = calculateStrategyV2(dates, closes, volumes);

  const trend = v3Result.trend;
  const trendStrength = v3Result.trendStrength;

  const kdjRaw = calcKDJ_Signal(dates, closes, highs, lows);
  const obvRaw = calcOBV_Signal(dates, closes, volumes);
  const adxRaw = calcADX_Signal(dates, closes, highs, lows);

  const KDJ = filterByTrend(kdjRaw, trend);
  const OBV = filterByTrend(obvRaw, trend);
  const ADX = filterByTrend(adxRaw, trend);

  const volMA20 = calcVolMA(volumes, 20);
  const KDJ_vol = applyVolFilter(KDJ, dates, volumes, volMA20);
  const OBV_vol = applyVolFilter(OBV, dates, volumes, volMA20);
  const ADX_vol = applyVolFilter(ADX, dates, volumes, volMA20);

  const allSignals = [
    v3Result.MA,
    v3Result.RSI,
    v3Result.MACD,
    v3Result.BOLL,
    v3Result.Divergence,
    KDJ_vol,
    OBV_vol,
    ADX_vol,
  ];

  const Combo = calcCombo(dates, allSignals, 2);

  const atrStops = calcATRStops(dates, closes, highs, lows, Combo.buy);

  const kdjLines = calcKDJ_Lines(closes, highs, lows);
  const obvLine = calcOBV_Line(closes, volumes);
  const adxLines = calcADX_Lines(closes, highs, lows);

  const indicators = {
    ...v3Result.indicators,
    kdjK: kdjLines.k,
    kdjD: kdjLines.d,
    kdjJ: kdjLines.j,
    obv: obvLine,
    adx: adxLines.adx,
    plusDI: adxLines.plusDI,
    minusDI: adxLines.minusDI,
  };

  return {
    trend,
    trendStrength,
    MA: v3Result.MA,
    RSI: v3Result.RSI,
    MACD: v3Result.MACD,
    BOLL: v3Result.BOLL,
    Divergence: v3Result.Divergence,
    KDJ: KDJ_vol,
    OBV: OBV_vol,
    ADX: ADX_vol,
    Combo,
    atrStops,
    indicators,
  };
}

// ===================== KDJ 随机指标 =====================
function calcKDJ_Lines(
  closes: number[],
  highs: number[],
  lows: number[]
): { k: (number | null)[]; d: (number | null)[]; j: (number | null)[] } {
  const kArr: (number | null)[] = [];
  const dArr: (number | null)[] = [];
  const jArr: (number | null)[] = [];
  const period = 9;

  let prevK = 50;
  let prevD = 50;

  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      kArr.push(null);
      dArr.push(null);
      jArr.push(null);
      continue;
    }

    const hSlice = highs.length > 0 ? highs.slice(i - period + 1, i + 1) : closes.slice(i - period + 1, i + 1);
    const lSlice = lows.length > 0 ? lows.slice(i - period + 1, i + 1) : closes.slice(i - period + 1, i + 1);
    const highN = Math.max(...hSlice);
    const lowN = Math.min(...lSlice);

    const rsv = lowN === highN ? 50 : ((closes[i] - lowN) / (highN - lowN)) * 100;
    const k = (2 / 3) * prevK + (1 / 3) * rsv;
    const d = (2 / 3) * prevD + (1 / 3) * k;
    const j = 3 * k - 2 * d;

    prevK = k;
    prevD = d;

    kArr.push(Math.round(k * 100) / 100);
    dArr.push(Math.round(d * 100) / 100);
    jArr.push(Math.round(j * 100) / 100);
  }

  return { k: kArr, d: dArr, j: jArr };
}

function calcKDJ_Signal(
  dates: string[],
  closes: number[],
  highs: number[],
  lows: number[]
): { buy: string[]; sell: string[] } {
  const buy: string[] = [];
  const sell: string[] = [];
  const { k, d } = calcKDJ_Lines(closes, highs, lows);
  const startIdx = 9;

  for (let i = startIdx; i < closes.length; i++) {
    if (k[i] === null || d[i] === null || k[i - 1] === null || d[i - 1] === null) continue;
    const prevK = k[i - 1] as number;
    const currK = k[i] as number;
    const prevD = d[i - 1] as number;
    const currD = d[i] as number;

    if (prevK < prevD && currK >= currD && currK < 30) {
      buy.push(dates[i]);
    }
    if (prevK > prevD && currK <= currD && currK > 70) {
      sell.push(dates[i]);
    }
  }

  return { buy, sell };
}

// ===================== OBV 能量潮 =====================
function calcOBV_Line(closes: number[], volumes: number[]): (number | null)[] {
  if (!volumes || volumes.length === 0) return closes.map(() => null);
  const obv: (number | null)[] = [0];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) {
      obv.push((obv[i - 1] as number) + volumes[i]);
    } else if (closes[i] < closes[i - 1]) {
      obv.push((obv[i - 1] as number) - volumes[i]);
    } else {
      obv.push(obv[i - 1] as number);
    }
  }
  return obv.map(v => v !== null ? Math.round(v) : null);
}

function calcOBV_Signal(
  dates: string[],
  closes: number[],
  volumes: number[]
): { buy: string[]; sell: string[] } {
  const buy: string[] = [];
  const sell: string[] = [];

  if (!volumes || volumes.length === 0) return { buy, sell };

  const obv = calcOBV_Line(closes, volumes);
  const lookback = 20;

  for (let i = lookback; i < closes.length; i++) {
    const priceSlice = closes.slice(i - lookback, i);
    const obvSlice = obv.slice(i - lookback, i);
    if (obvSlice.some(v => v === null)) continue;

    const minPrice = Math.min(...priceSlice);
    const numericObvSlice = obvSlice as number[];
    const minObv = Math.min(...numericObvSlice);
    const maxPrice = Math.max(...priceSlice);
    const maxObv = Math.max(...numericObvSlice);

    if (closes[i] < minPrice && (obv[i] as number) > minObv) {
      buy.push(dates[i]);
    }
    if (closes[i] > maxPrice && (obv[i] as number) < maxObv) {
      sell.push(dates[i]);
    }
  }

  return { buy, sell };
}

// ===================== ADX 趋向指标 =====================
function calcADX_Lines(
  closes: number[],
  highs: number[],
  lows: number[]
): { adx: (number | null)[]; plusDI: (number | null)[]; minusDI: (number | null)[] } {
  const adxArr: (number | null)[] = [];
  const plusDIArr: (number | null)[] = [];
  const minusDIArr: (number | null)[] = [];
  const period = 14;

  if (highs.length === 0 || lows.length === 0) {
    for (let i = 0; i < closes.length; i++) {
      adxArr.push(null);
      plusDIArr.push(null);
      minusDIArr.push(null);
    }
    return { adx: adxArr, plusDI: plusDIArr, minusDI: minusDIArr };
  }

  const trArr: number[] = [];
  const plusDMArr: number[] = [];
  const minusDMArr: number[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (i === 0) {
      trArr.push(highs[0] - lows[0]);
      plusDMArr.push(0);
      minusDMArr.push(0);
      continue;
    }
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trArr.push(tr);

    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    plusDMArr.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDMArr.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  const smoothedTR = calcWilderSmooth(trArr, period);
  const smoothedPlusDM = calcWilderSmooth(plusDMArr, period);
  const smoothedMinusDM = calcWilderSmooth(minusDMArr, period);

  const plusDIValues: number[] = [];
  const minusDIValues: number[] = [];
  const dxValues: number[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (i < period || smoothedTR[i] === 0) {
      plusDIValues.push(0);
      minusDIValues.push(0);
      dxValues.push(0);
      continue;
    }
    const pdi = 100 * smoothedPlusDM[i] / smoothedTR[i];
    const mdi = 100 * smoothedMinusDM[i] / smoothedTR[i];
    plusDIValues.push(pdi);
    minusDIValues.push(mdi);
    const dxSum = pdi + mdi;
    dxValues.push(dxSum === 0 ? 0 : 100 * Math.abs(pdi - mdi) / dxSum);
  }

  const adxValues = calcWilderSmooth(dxValues, period);

  for (let i = 0; i < closes.length; i++) {
    if (i < period * 2) {
      adxArr.push(null);
      plusDIArr.push(null);
      minusDIArr.push(null);
    } else {
      adxArr.push(Math.round(adxValues[i] * 100) / 100);
      plusDIArr.push(Math.round(plusDIValues[i] * 100) / 100);
      minusDIArr.push(Math.round(minusDIValues[i] * 100) / 100);
    }
  }

  return { adx: adxArr, plusDI: plusDIArr, minusDI: minusDIArr };
}

function calcWilderSmooth(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(0);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    if (i < period) {
      sum += values[i];
      if (i === period - 1) result[i] = sum;
    } else {
      result[i] = result[i - 1] - result[i - 1] / period + values[i];
    }
  }
  return result;
}

function calcADX_Signal(
  dates: string[],
  closes: number[],
  highs: number[],
  lows: number[]
): { buy: string[]; sell: string[] } {
  const buy: string[] = [];
  const sell: string[] = [];

  if (highs.length === 0 || lows.length === 0) return { buy, sell };

  const { adx, plusDI, minusDI } = calcADX_Lines(closes, highs, lows);

  for (let i = 1; i < closes.length; i++) {
    if (adx[i] === null || plusDI[i] === null || minusDI[i] === null ||
        adx[i - 1] === null || plusDI[i - 1] === null || minusDI[i - 1] === null) continue;

    const prevPDI = plusDI[i - 1] as number;
    const currPDI = plusDI[i] as number;
    const prevMDI = minusDI[i - 1] as number;
    const currMDI = minusDI[i] as number;
    const currADX = adx[i] as number;

    if (prevPDI < prevMDI && currPDI >= currMDI && currADX > 20) {
      buy.push(dates[i]);
    }
    if (prevPDI > prevMDI && currPDI <= currMDI && currADX > 20) {
      sell.push(dates[i]);
    }
  }

  return { buy, sell };
}

// ===================== 成交量均线 =====================
function calcVolMA(volumes: number[], period: number): number[] {
  if (!volumes || volumes.length === 0) return [];
  const res: number[] = [];
  for (let i = 0; i < volumes.length; i++) {
    if (i < period - 1) { res.push(0); continue; }
    const sum = volumes.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    res.push(sum / period);
  }
  return res;
}

// ===================== 趋势过滤 =====================
function filterByTrend(
  signal: { buy: string[]; sell: string[] },
  trend: string
): { buy: string[]; sell: string[] } {
  if (trend === "uptrend") return { buy: signal.buy, sell: [] };
  if (trend === "downtrend") return { buy: [], sell: signal.sell };
  return signal;
}

// ===================== 成交量过滤 =====================
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
    buy: signal.buy.filter(d => volMap[d] !== false),
    sell: signal.sell.filter(d => volMap[d] !== false),
  };
}

// ===================== Combo 共振 =====================
function calcCombo(
  dates: string[],
  signals: Array<{ buy: string[]; sell: string[] }>,
  threshold: number
): { buy: string[]; sell: string[] } {
  const buyCount: Record<string, number> = {};
  const sellCount: Record<string, number> = {};

  for (const sig of signals) {
    for (const d of sig.buy) buyCount[d] = (buyCount[d] || 0) + 1;
    for (const d of sig.sell) sellCount[d] = (sellCount[d] || 0) + 1;
  }

  const buy = Object.keys(buyCount).filter(d => buyCount[d] >= threshold);
  const sell = Object.keys(sellCount).filter(d => sellCount[d] >= threshold);

  buy.sort();
  sell.sort();
  return { buy, sell };
}

// ===================== 真实 ATR 止损 =====================
function calcATRStops(
  dates: string[],
  closes: number[],
  highs: number[],
  lows: number[],
  buyDates: string[]
): Record<string, { stopPrice: number; atr: number }> {
  const result: Record<string, { stopPrice: number; atr: number }> = {};
  const dateIndex: Record<string, number> = {};
  dates.forEach((d, i) => { dateIndex[d] = i; });

  const period = 14;
  const useRealATR = highs.length > 0 && lows.length > 0;

  for (const d of buyDates) {
    const idx = dateIndex[d];
    if (idx === undefined || idx < period) continue;

    let atrSum = 0;
    for (let i = idx - period + 1; i <= idx; i++) {
      if (useRealATR) {
        const tr = Math.max(
          highs[i] - lows[i],
          Math.abs(highs[i] - closes[i - 1]),
          Math.abs(lows[i] - closes[i - 1])
        );
        atrSum += tr;
      } else {
        atrSum += Math.abs(closes[i] - closes[i - 1]);
      }
    }
    const atr = atrSum / period;
    const stopPrice = closes[idx] - 1.5 * atr;

    result[d] = {
      stopPrice: Math.round(stopPrice * 100) / 100,
      atr: Math.round(atr * 100) / 100
    };
  }
  return result;
}
