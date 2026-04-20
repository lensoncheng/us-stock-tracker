export function calculateAllSignals(dates: string[], closes: number[]) {
  const buy: string[] = [];
  const sell: string[] = [];

  if (dates.length < 30) {
    return { buyPoints: [], sellPoints: [] };
  }

  try {
    const ma = getMA(dates, closes);
    const rsi = getRSI(dates, closes);
    const macd = getMACD(dates, closes);
    const boll = getBOLL(dates, closes);

    buy.push(...ma.buy, ...rsi.buy, ...macd.buy, ...boll.buy);
    sell.push(...ma.sell, ...rsi.sell, ...macd.sell, ...boll.sell);
  } catch (e) {}

  return {
    buyPoints: Array.from(new Set(buy)),
    sellPoints: Array.from(new Set(sell))
  };
}

function getMA(dates: string[], closes: number[]) {
  const buy: string[] = [];
  const sell: string[] = [];
  const minLen = 21;

  if (closes.length < minLen) return { buy, sell };

  for (let i = 20; i < closes.length; i++) {
    const slice5 = closes.slice(i - 5, i);
    const ma5 = slice5.length ? slice5.reduce((a, b) => a + b, 0) / 5 : 0;

    const slice20 = closes.slice(i - 20, i);
    const ma20 = slice20.length ? slice20.reduce((a, b) => a + b, 0) / 20 : 0;

    const sliceP5 = closes.slice(i - 6, i - 1);
    const p5 = sliceP5.length ? sliceP5.reduce((a, b) => a + b, 0) / 5 : 0;

    const sliceP20 = closes.slice(i - 21, i - 1);
    const p20 = sliceP20.length ? sliceP20.reduce((a, b) => a + b, 0) / 20 : 0;

    if (p5 < p20 && ma5 > ma20) buy.push(dates[i]);
    if (p5 > p20 && ma5 < ma20) sell.push(dates[i]);
  }
  return { buy, sell };
}

function getRSI(dates: string[], closes: number[], period = 14) {
  const buy: string[] = [];
  const sell: string[] = [];
  if (closes.length < period + 1) return { buy, sell };

  const rsi: number[] = [];
  for (let i = period; i < closes.length; i++) {
    let gains = 0, losses = 0;
    for (let j = i - period + 1; j <= i; j++) {
      if (j - 1 < 0) continue;
      const chg = closes[j] - closes[j - 1];
      if (chg > 0) gains += chg;
      else losses -= chg;
    }
    const rs = losses === 0 ? 999 : gains / losses;
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
  if (closes.length < 30) return { buy, sell };

  try {
    const ema12 = ema(closes, 12);
    const ema26 = ema(closes, 26);
    const macd = ema12.map((v, i) => v - ema26[i]);
    const signal = ema(macd, 9);

    for (let i = 1; i < macd.length; i++) {
      if (macd[i - 1] < signal[i - 1] && macd[i] > signal[i]) buy.push(dates[i]);
      if (macd[i - 1] > signal[i - 1] && macd[i] < signal[i]) sell.push(dates[i]);
    }
  } catch (e) {}
  return { buy, sell };
}

function getBOLL(dates: string[], closes: number[]) {
  const buy: string[] = [];
  const sell: string[] = [];
  const period = 20;
  if (closes.length < period + 1) return { buy, sell };

  try {
    for (let i = period; i < closes.length; i++) {
      const slice = closes.slice(i - period, i);
      const mid = slice.reduce((a, b) => a + b, 0) / period;
      const std = Math.sqrt(slice.reduce((s, v) => s + (v - mid) ** 2, 0) / period);
      const upper = mid + 2 * std;
      const lower = mid - 2 * std;
      const c = closes[i];
      if (c < lower) buy.push(dates[i]);
      if (c > upper) sell.push(dates[i]);
    }
  } catch (e) {}
  return { buy, sell };
}

function ema(values: number[], period: number): number[] {
  if (!values.length) return [];
  const k = 2 / (period + 1);
  const out: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    out.push(values[i] * k + out[i - 1] * (1 - k));
  }
  return out;
}
