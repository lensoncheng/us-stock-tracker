// file-system.ts
export class FileSystem {
  private kv: KVNamespace;

  constructor(kv: KVNamespace) {
    this.kv = kv;
  }

  // 写入数据：数组 → JSON字符串
  async write(symbol: string, type: "data" | "signal", lines: string[]): Promise<void> {
    const key = `${symbol}::${type}`;
    // 把数组转成JSON字符串再写入KV
    await this.kv.put(key, JSON.stringify(lines));
  }

  // 读取数据：JSON字符串 → 数组
  async read(symbol: string, type: "data" | "signal"): Promise<string[]> {
    const key = `${symbol}::${type}`;
    const raw = await this.kv.get<string>(key);
    if (!raw) return [];
    // 把JSON字符串解析回数组
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.error(`[FileSystem] 解析KV数据失败: ${key}`, e);
      return [];
    }
  }
}
