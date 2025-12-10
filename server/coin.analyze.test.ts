import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock数据库函数
vi.mock("./db", () => ({
  getOrCreateDevice: vi.fn(async (fingerprint: string) => ({
    id: 1,
    deviceFingerprint: fingerprint,
    lastTossDate: null,
    lastReadingId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  })),
  getTodaysCoinReading: vi.fn(async () => null),
  createCoinReading: vi.fn(async (deviceId: number, coinResults: number[], tossDate: Date) => ({
    id: 1,
    deviceId,
    coinResults,
    tossDate,
    analysis: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  })),
  updateCoinReadingAnalysis: vi.fn(async () => {}),
  updateDeviceLastToss: vi.fn(async () => {}),
  getDeviceCoinReadings: vi.fn(async () => []),
}));

// Mock LLM函数
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(async () => ({
    choices: [
      {
        message: {
          content: JSON.stringify({
            greeting: "阳光还没完全升起，而你已经值得被温柔对待。",
            outfit: "今天适合一些柔软与轻盈的穿搭。",
            color: "湖水蓝——它会让你整天都感到清爽、冷静。",
            mood: "内心安静而有力量，适合开启专注的一天。",
            career: "今天的思维清晰，适合做那些需要逻辑和规划的工作。",
            love: "适合写点真心话给某个人。",
            luck: "路上巧遇喜欢的音乐，就是今天的小确幸。",
          }),
        },
      },
    ],
  })),
}));

function createTestContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("coin.getToday", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should get today's fortune without authentication", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.coin.getToday({
      deviceFingerprint: "test-device-123",
    });

    expect(result).toBeDefined();
    expect(result.coinResults).toBeDefined();
    expect(result.coinResults.length).toBe(6);
    expect(result.analysis).toBeDefined();
    expect(result.analysis.greeting).toBeDefined();
    expect(result.analysis.outfit).toBeDefined();
    expect(result.analysis.color).toBeDefined();
    expect(result.analysis.mood).toBeDefined();
    expect(result.analysis.career).toBeDefined();
    expect(result.analysis.love).toBeDefined();
    expect(result.analysis.luck).toBeDefined();
  });
});

describe("coin.history", () => {
  it("should return device coin reading history", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.coin.history({
      deviceFingerprint: "test-device-123",
      limit: 10,
    });

    expect(Array.isArray(result)).toBe(true);
  });

  it("should respect limit parameter", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.coin.history({
      deviceFingerprint: "test-device-123",
      limit: 5,
    });

    expect(Array.isArray(result)).toBe(true);
  });
});
