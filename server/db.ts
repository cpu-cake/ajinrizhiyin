import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { coinReadings, CoinReading, devices, Device } from "../drizzle/schema.js";

let _db: ReturnType<typeof drizzle> | null = null;

// 简易内存数据，用于本地无数据库时的预览模式
type MemoryDevice = Device & { id: number };
type MemoryReading = CoinReading & { id: number };
type MemoryQuestionTagClick = {
  questionText: string;
  deviceFingerprint: string;
  clickDate: string;
};

const memoryStore = {
  devices: [] as MemoryDevice[],
  readings: [] as MemoryReading[],
  questionClicks: [] as MemoryQuestionTagClick[],
};

// 将 Date 转换为 YYYY-MM-DD 字符串
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

// 获取中国时区（UTC+8）的今天日期字符串
function getChinaTodayStr(): string {
  const now = new Date();
  const chinaTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return chinaTime.toISOString().split('T')[0];
}

const sameDay = (a: string, b: string) => a === b;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const sql = neon(process.env.DATABASE_URL);
      _db = drizzle(sql);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

/**
 * 获取或创建设备记录
 */
export async function getOrCreateDevice(deviceFingerprint: string): Promise<Device | null> {
  const db = await getDb();
  if (!db) {
    // 内存模式
    let existing = memoryStore.devices.find(d => d.deviceFingerprint === deviceFingerprint);
    if (existing) return existing;
    const created: MemoryDevice = {
      id: memoryStore.devices.length + 1,
      deviceFingerprint,
      lastReadingId: null,
      lastTossDate: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as MemoryDevice;
    memoryStore.devices.push(created);
    return created;
  }

  try {
    const existing = await db
      .select()
      .from(devices)
      .where(eq(devices.deviceFingerprint, deviceFingerprint))
      .limit(1);

    if (existing.length > 0) {
      return existing[0];
    }

    await db.insert(devices).values({
      deviceFingerprint,
    });

    const created = await db
      .select()
      .from(devices)
      .where(eq(devices.deviceFingerprint, deviceFingerprint))
      .limit(1);

    return created.length > 0 ? created[0] : null;
  } catch (error) {
    console.error("[Database] Failed to get or create device:", error);
    throw error;
  }
}

/**
 * 获取设备今天的投掷记录（如果存在）
 */
export async function getTodaysCoinReading(deviceId: number, todayDate: Date): Promise<CoinReading | null> {
  const db = await getDb();
  const dateStr = formatDate(todayDate);
  
  if (!db) {
    const found = memoryStore.readings.find(r => r.deviceId === deviceId && sameDay(r.tossDate, dateStr));
    return found || null;
  }

  try {
    const result = await db
      .select()
      .from(coinReadings)
      .where(
        and(
          eq(coinReadings.deviceId, deviceId),
          eq(coinReadings.tossDate, dateStr)
        )
      )
      .limit(1);

    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error("[Database] Failed to get today's coin reading:", error);
    throw error;
  }
}

/**
 * 创建硬币投掷记录
 */
export async function createCoinReading(
  deviceId: number,
  coinResults: number[],
  tossDate: Date,
  type: string = "daily_fortune"
): Promise<CoinReading | null> {
  const db = await getDb();
  const dateStr = formatDate(tossDate);
  
  if (!db) {
    const created: MemoryReading = {
      id: memoryStore.readings.length + 1,
      deviceId,
      coinResults,
      tossDate: dateStr,
      type,
      analysis: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as MemoryReading;
    memoryStore.readings.push(created);
    return created;
  }

  try {
    await db.insert(coinReadings).values({
      coinResults,
      tossDate: dateStr,
      deviceId,
      type,
    });

    const inserted = await db
      .select()
      .from(coinReadings)
      .where(
        and(
          eq(coinReadings.deviceId, deviceId),
          eq(coinReadings.tossDate, dateStr)
        )
      )
      .orderBy(coinReadings.createdAt)
      .limit(1);

    return inserted.length > 0 ? inserted[0] : null;
  } catch (error) {
    console.error("[Database] Failed to create coin reading:", error);
    throw error;
  }
}

/**
 * 更新硬币投掷记录的分析结果
 */
export async function updateCoinReadingAnalysis(
  readingId: number,
  analysis: CoinReading["analysis"]
): Promise<void> {
  const db = await getDb();
  if (!db) {
    const reading = memoryStore.readings.find(r => r.id === readingId);
    if (reading) {
      reading.analysis = analysis;
      reading.updatedAt = new Date();
    }
    return;
  }

  try {
    await db
      .update(coinReadings)
      .set({ analysis })
      .where(eq(coinReadings.id, readingId));
  } catch (error) {
    console.error("[Database] Failed to update coin reading:", error);
    throw error;
  }
}

/**
 * 更新硬币投掷记录的单个分析字段
 */
export async function updateCoinReadingField(
  readingId: number,
  fieldName: string,
  fieldValue: string
): Promise<void> {
  const db = await getDb();
  if (!db) {
    const reading = memoryStore.readings.find(r => r.id === readingId);
    if (reading) {
      if (!reading.analysis) {
        reading.analysis = {} as CoinReading["analysis"];
      }
      (reading.analysis as Record<string, string>)[fieldName] = fieldValue;
      reading.updatedAt = new Date();
    }
    return;
  }

  try {
    const existing = await db
      .select()
      .from(coinReadings)
      .where(eq(coinReadings.id, readingId))
      .limit(1);
    
    if (existing.length > 0) {
      const currentAnalysis = existing[0].analysis || {} as Record<string, string>;
      const updatedAnalysis = {
        ...currentAnalysis,
        [fieldName]: fieldValue,
      } as {
        greeting: string;
        outfit: string;
        color: string;
        mood: string;
        career: string;
        love: string;
        luck: string;
      };
      
      await db
        .update(coinReadings)
        .set({ analysis: updatedAnalysis })
        .where(eq(coinReadings.id, readingId));
    }
  } catch (error) {
    console.error("[Database] Failed to update coin reading field:", error);
    throw error;
  }
}

/**
 * 更新设备的最后投掷信息
 */
export async function updateDeviceLastToss(deviceId: number, readingId: number, tossDate: Date): Promise<void> {
  const db = await getDb();
  const dateStr = formatDate(tossDate);
  
  if (!db) {
    const device = memoryStore.devices.find(d => d.id === deviceId);
    if (device) {
      device.lastReadingId = readingId;
      device.lastTossDate = dateStr;
      device.updatedAt = new Date();
    }
    return;
  }

  try {
    await db
      .update(devices)
      .set({
        lastReadingId: readingId,
        lastTossDate: dateStr,
      })
      .where(eq(devices.id, deviceId));
  } catch (error) {
    console.error("[Database] Failed to update device last toss:", error);
    throw error;
  }
}

/**
 * 获取设备今天的使用次数
 */
export async function getTodaysUsageCount(deviceId: number, todayDate: Date, type?: string): Promise<number> {
  const db = await getDb();
  const dateStr = formatDate(todayDate);
  
  if (!db) {
    return memoryStore.readings.filter(
      r =>
        r.deviceId === deviceId &&
        sameDay(r.tossDate, dateStr) &&
        (!type || r.type === type)
    ).length;
  }

  try {
    const conditions = [
      eq(coinReadings.deviceId, deviceId),
      eq(coinReadings.tossDate, dateStr)
    ];
    
    if (type) {
      conditions.push(eq(coinReadings.type, type));
    }
    
    const result = await db
      .select()
      .from(coinReadings)
      .where(and(...conditions));

    return result.length;
  } catch (error) {
    console.error("[Database] Failed to get today's usage count:", error);
    return 0;
  }
}

/**
 * 获取设备的投掷历史
 */
export async function getDeviceCoinReadings(deviceId: number, limit: number = 10): Promise<CoinReading[]> {
  const db = await getDb();
  if (!db) {
    return memoryStore.readings
      .filter(r => r.deviceId === deviceId)
      .sort((a, b) => (a.createdAt?.getTime?.() || 0) - (b.createdAt?.getTime?.() || 0))
      .slice(0, limit);
  }

  try {
    const result = await db
      .select()
      .from(coinReadings)
      .where(eq(coinReadings.deviceId, deviceId))
      .orderBy(coinReadings.createdAt)
      .limit(limit);

    return result;
  } catch (error) {
    console.error("[Database] Failed to get coin readings:", error);
    throw error;
  }
}

/**
 * 记录标签点击
 */
export async function recordQuestionTagClick(questionText: string, deviceFingerprint: string): Promise<void> {
  const db = await getDb();
  const dateStr = getChinaTodayStr();
  
  if (!db) {
    memoryStore.questionClicks.push({
      questionText,
      deviceFingerprint,
      clickDate: dateStr,
    });
    return;
  }

  try {
    const { questionTagClicks } = await import("../drizzle/schema.js");
    
    await db.insert(questionTagClicks).values({
      questionText,
      deviceFingerprint,
      clickDate: dateStr,
    });
  } catch (error) {
    console.error("[Database] Failed to record question tag click:", error);
  }
}

/**
 * 获取今天的热门标签
 */
export async function getTodayHotQuestions(): Promise<string[]> {
  const db = await getDb();
  if (!db) {
    const counts = new Map<string, number>();
    memoryStore.questionClicks.forEach(c => {
      const key = c.questionText;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([q]) => q);
  }

  try {
    const { hotQuestions } = await import("../drizzle/schema.js");
    const { desc } = await import("drizzle-orm");
    
    const latestStats = await db
      .select()
      .from(hotQuestions)
      .orderBy(desc(hotQuestions.statsDate))
      .limit(1);
    
    if (latestStats.length === 0) {
      return [];
    }
    
    const latestDate = latestStats[0].statsDate;
    
    const hotTags = await db
      .select()
      .from(hotQuestions)
      .where(eq(hotQuestions.statsDate, latestDate))
      .orderBy(hotQuestions.rank);
    
    return hotTags.map(tag => tag.questionText);
  } catch (error) {
    console.error("[Database] Failed to get hot questions:", error);
    return [];
  }
}

/**
 * 统计前一天的热门标签（每天凌晨4点执行）
 */
export async function calculateHotQuestions(): Promise<void> {
  const db = await getDb();
  if (!db) {
    return;
  }

  try {
    const { questionTagClicks, hotQuestions } = await import("../drizzle/schema.js");
    const { sql, lt } = await import("drizzle-orm");
    
    // 使用中国时区计算昨天的日期
    const now = new Date();
    const chinaTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    chinaTime.setUTCDate(chinaTime.getUTCDate() - 1);
    const yesterdayStr = chinaTime.toISOString().split('T')[0];
    
    const clickStats = await db
      .select({
        questionText: questionTagClicks.questionText,
        clickCount: sql<number>`COUNT(*)`.as('clickCount'),
      })
      .from(questionTagClicks)
      .where(eq(questionTagClicks.clickDate, yesterdayStr))
      .groupBy(questionTagClicks.questionText)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(5);
    
    if (clickStats.length === 0) {
      console.log("[Database] No click data for yesterday, skipping hot questions calculation");
      return;
    }
    
    // 使用中国时区计算7天前的日期
    const sevenDaysAgo = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
    
    await db
      .delete(hotQuestions)
      .where(lt(hotQuestions.statsDate, sevenDaysAgoStr));
    
    for (let i = 0; i < clickStats.length; i++) {
      await db.insert(hotQuestions).values({
        questionText: clickStats[i].questionText,
        clickCount: clickStats[i].clickCount,
        statsDate: yesterdayStr,
        rank: i + 1,
      });
    }
    
    console.log(`[Database] Calculated ${clickStats.length} hot questions for ${yesterdayStr}`);
  } catch (error) {
    console.error("[Database] Failed to calculate hot questions:", error);
  }
}
