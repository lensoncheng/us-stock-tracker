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

  // 读取单个 key 的值
  async get(key: string): Promise<string | null> {
    return await this.kv.get(key);
  }

  // 写入单个 key 的值
  async put(key: string, value: string): Promise<void> {
    await this.kv.put(key, value);
  }

  // 读取单个 key 的值并转换为数字
  async getNumber(key: string): Promise<number | null> {
    const value = await this.kv.get(key);
    if (value === null) return null;
    const num = parseInt(value, 10);
    return isNaN(num) ? null : num;
  }

  // 写入数字值到单个 key
  async putNumber(key: string, value: number): Promise<void> {
    await this.kv.put(key, value.toString());
  }
}
