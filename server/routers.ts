import { router, publicProcedure } from "./_core/trpc.js";
import { z } from "zod";
import { invokeLLM } from "./_core/llm.js";
import {
  createCoinReading,
  getOrCreateDevice,
  getTodaysCoinReading,
  updateDeviceLastToss,
  getTodaysUsageCount,
  updateCoinReadingField,
} from "./db.js";

/**
 * 获取中国时区（UTC+8）的今天日期
 * 确保服务器和用户使用同一个日期标准
 */
function getChinaToday(): Date {
  const now = new Date();
  // 获取 UTC 时间戳，加上 8 小时得到中国时间
  const chinaTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  // 返回中国时区的日期（零点）
  return new Date(
    Date.UTC(chinaTime.getUTCFullYear(), chinaTime.getUTCMonth(), chinaTime.getUTCDate())
  );
}

/**
 * 获取中国时区的当前小时
 */
function getChinaHour(): number {
  const now = new Date();
  const chinaTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return chinaTime.getUTCHours();
}

// 字段配置：每个字段的提示词和描述
const FIELD_CONFIGS = {
  greeting: {
    name: "早安心语",
    prompt: "温暖的早安祝福和鼓励，1-2句话",
    description: "早安心语：温暖的早安祝福",
  },
  outfit: {
    name: "穿搭灵感",
    prompt: "根据能量指数推荐的穿搭风格，1-2句话",
    description: "穿搭灵感：今天适合的穿搭建议",
  },
  color: {
    name: "幸运配色",
    prompt: "推荐的幸运颜色和其含义，1-2句话",
    description: "幸运配色：推荐的幸运颜色和其含义",
  },
  mood: {
    name: "情绪流动",
    prompt: "今天的情绪特点和调整建议，1-2句话",
    description: "情绪流动：今天的情绪特点和调整建议",
  },
  career: {
    name: "工作指引",
    prompt: "工作方面的建议，1-2句话",
    description: "工作指引：工作方面的建议",
  },
  love: {
    name: "情感气场",
    prompt: "人际关系和情感方面的建议，1-2句话",
    description: "情感气场：人际关系和情感方面的建议",
  },
  luck: {
    name: "幸运微光",
    prompt: "今天可能的小幸运，1-2句话",
    description: "幸运微光：今天可能的小幸运",
  },
} as const;

type FieldName = keyof typeof FIELD_CONFIGS;

// 使用次数限制提示语
const LIMIT_MESSAGES_DAYTIME = [
  "今天的智慧已耗尽，明天再继续为你出谋划策～",
  "小脑瓜冒烟啦！明天再来帮你想主意吧～",
  "今天的小困惑已经努力回答完啦，请明天再来呀～",
  "哎呀，小指南针今天转累了，明天再陪你找方向～",
  "问题超限，再问就要剧透宇宙奥秘了～明天继续哦！"
];

const LIMIT_MESSAGES_NIGHT = [
  "问题就先放一放，夜里睡个好觉，明天再一起想办法～",
  "你今天已经很努力啦，明天再继续帮你出主意，好不好～",
  "留一点小困惑给明天，就像留一点梦给星星～",
  "问题不是今天一定要解完的事，明天继续一起解锁生活～"
];

function getRandomLimitMessage(): string {
  const hour = getChinaHour();
  
  // 20:00-24:00使用夜间提示语
  if (hour >= 20) {
    return LIMIT_MESSAGES_NIGHT[Math.floor(Math.random() * LIMIT_MESSAGES_NIGHT.length)];
  } else {
    return LIMIT_MESSAGES_DAYTIME[Math.floor(Math.random() * LIMIT_MESSAGES_DAYTIME.length)];
  }
}

export const appRouter = router({
  /**
   * 硬币投掷和运势分析功能
   */
  coin: router({
    /**
     * 获取今日运势基础信息
     * 基于设备指纹，每天只投掷一次
     * 返回硬币结果和已缓存的分析字段（如果有）
     */
    getToday: publicProcedure
      .input(
        z.object({
          deviceFingerprint: z.string(),
        })
      )
      .query(async ({ input }) => {
        try {
          // 获取或创建设备记录
          const device = await getOrCreateDevice(input.deviceFingerprint);
          if (!device) {
            throw new Error("Failed to get or create device");
          }

          // 获取今天的日期（中国时区）
          const todayDate = getChinaToday();

          // 检查是否已有今天的投掷记录
          const existingReading = await getTodaysCoinReading(device.id, todayDate);
          if (existingReading) {
            return {
              id: existingReading.id,
              coinResults: existingReading.coinResults,
              analysis: existingReading.analysis || {},
              isCached: true,
            };
          }

          // 执行新的投掷（不进行分析，分析由 getField 单独处理）
          const result = await performNewTossWithoutAnalysis(device.id, todayDate);

          // 更新设备的最后投掷日期
          await updateDeviceLastToss(device.id, result.id, todayDate);

          return {
            ...result,
            analysis: {},
          };
        } catch (error) {
          console.error("[Coin] Get today error:", error);
          throw error;
        }
      }),

    /**
     * 获取单个分析字段
     * 如果已缓存则直接返回，否则调用 LLM 生成
     */
    getField: publicProcedure
      .input(
        z.object({
          deviceFingerprint: z.string(),
          fieldName: z.enum(["greeting", "outfit", "color", "mood", "career", "love", "luck"]),
        })
      )
      .query(async ({ input }) => {
        try {
          const { deviceFingerprint, fieldName } = input;

          // 获取设备记录
          const device = await getOrCreateDevice(deviceFingerprint);
          if (!device) {
            throw new Error("Failed to get device");
          }

          // 获取今天的日期（中国时区）
          const todayDate = getChinaToday();

          // 获取今天的投掷记录
          const reading = await getTodaysCoinReading(device.id, todayDate);
          if (!reading) {
            throw new Error("No coin reading found for today");
          }

          // 检查字段是否已缓存
          const analysis = reading.analysis as Record<string, string> | null;
          if (analysis && analysis[fieldName]) {
            return {
              fieldName,
              value: analysis[fieldName],
              isCached: true,
            };
          }

          // 调用 LLM 生成该字段
          const fieldValue = await generateSingleField(
            reading.coinResults,
            fieldName as FieldName
          );

          // 保存到数据库
          await updateCoinReadingField(reading.id, fieldName, fieldValue);

          return {
            fieldName,
            value: fieldValue,
            isCached: false,
          };
        } catch (error) {
          console.error("[Coin] Get field error:", error);
          throw error;
        }
      }),

    /**
     * 解答小困惑
     * 根据用户的问题和硬币结果提供LLM生成的解读
     * 每天限制6次
     */
    explainQuestion: publicProcedure
      .input(
        z.object({
          question: z.string(),
          coinResults: z.array(z.number()).optional(),
          deviceFingerprint: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        try {
          // 获取或创建设备记录
          const device = await getOrCreateDevice(input.deviceFingerprint);
          if (!device) {
            throw new Error("Failed to get or create device");
          }

          // 获取今天的日期（中国时区）
          const todayDate = getChinaToday();

          // 检查今天的使用次数（只统计question_answer类型）
          const usageCount = await getTodaysUsageCount(device.id, todayDate, "question_answer");
          if (usageCount >= 6) {
            return {
              explanation: getRandomLimitMessage(),
              limitExceeded: true,
              message: getRandomLimitMessage(),
            };
          }

          // 每次都重新投币，生成新的硬币结果
          const coinResults: number[] = [];
          for (let i = 0; i < 6; i++) {
            const flips = [
              Math.random() < 0.5 ? 0 : 1,
              Math.random() < 0.5 ? 0 : 1,
              Math.random() < 0.5 ? 0 : 1,
            ];
            const backCount = flips.filter((f) => f === 1).length;
            coinResults.push(backCount);
          }

          // 添加调试日志，验证每次生成的硬币结果是否不同
          console.log('--- NEW COINS FOR QUESTION ---', coinResults);

          // 将硬币结果转换为卦象描述
          const yaoLines = coinResults.map((num) => {
            const descriptions = [
              "三个反面",
              "两个反面",
              "一个反面",
              "零个反面",
            ];
            return descriptions[num] || "未知";
          });
          const coinDescription = `根据硬币投掷结果（${yaoLines.join(" ")}），`;

          const userMessage = `${coinDescription}请给我关于“${input.question}”的建议。`;

          const response = await invokeLLM({
            messages: [
              {
                role: "system",
                content:
                  "请根据六爻卦象给出这个问题的指引，直接说结论，不要说卦象和分析过程，请用温暖、鼓励的语气，语言要直白，不要用古语，比如\"您所问之事\"\"并无大碍\"\"宜\"\"不宜\"，但需要进行个性化分析，不要有括号内的解释。不要使用'硬币'、'卦'、'卦象'、'象'、'此象'、'运势'、'爻'等词汇。一定不要出现'硬币'、'卦'、'卦象'、'象'、'此象'、'运势'、'爻'几个字",
              },
              {
                role: "user",
                content: userMessage,
              },
            ],
          });

          const explanation =
            response.choices[0]?.message?.content || "无法生成解读";

          // 创建投掷记录以记录使用次数（标记为question_answer类型）
          await createCoinReading(device.id, coinResults, todayDate, "question_answer");
          
          // 记录标签点击
          const { recordQuestionTagClick } = await import("./db.js");
          await recordQuestionTagClick(input.question, input.deviceFingerprint);

          return {
            explanation,
            limitExceeded: false,
          };
        } catch (error) {
          console.error("[Coin] Explain question error:", error);
          throw new Error("Failed to explain question");
        }
      }),
  }),
  
  /**
   * 热门标签功能
   */
  hotQuestions: router({
    /**
     * 获取今天的热门标签
     * 返回昨天统计的热门标签（因为是凌晨4点统计的）
     */
    getToday: publicProcedure
      .query(async () => {
        try {
          const { getTodayHotQuestions } = await import("./db.js");
          const hotQuestions = await getTodayHotQuestions();
          return {
            hotQuestions,
          };
        } catch (error) {
          console.error("[HotQuestions] Get today error:", error);
          return {
            hotQuestions: [],
          };
        }
      }),
  }),
});

/**
 * 执行新的投掷（不进行分析）
 */
async function performNewTossWithoutAnalysis(
  deviceId: number,
  tossDate: Date
) {
  // 生成硬币投掷结果
  const coinResults: number[] = [];
  for (let i = 0; i < 6; i++) {
    const flips = [
      Math.random() < 0.5 ? 0 : 1,
      Math.random() < 0.5 ? 0 : 1,
      Math.random() < 0.5 ? 0 : 1,
    ];
    const backCount = flips.filter((f) => f === 1).length;
    coinResults.push(backCount);
  }

  // 创建投掷记录
  const reading = await createCoinReading(deviceId, coinResults, tossDate);
  if (!reading) {
    throw new Error("Failed to create coin reading");
  }

  return {
    id: reading.id,
    coinResults,
    isCached: false,
  };
}

/**
 * 生成单个分析字段
 */
async function generateSingleField(
  coinResults: number[],
  fieldName: FieldName
): Promise<string> {
  const fieldConfig = FIELD_CONFIGS[fieldName];
  const sum = coinResults.reduce((a, b) => a + b, 0);
  const seedIndex = sum % 4;

  // 构建详细的背景信息
  const resultDescription = coinResults
    .map((val, idx) => {
      const descriptions = [
        "三个反面",
        "两个反面",
        "一个反面",
        "零个反面",
      ];
      return `位置${idx + 1}：${descriptions[val]}（值${val}）`;
    })
    .join("\n");

  const prompt = `用户提供了卦象（六爻三卜），具体如下：

${resultDescription}

总值：${sum}
能量指数：${seedIndex}（0-3之间，0表示静谦，3表示活力）

请根据这些特征，为用户提供【${fieldConfig.name}】的个性化指引：${fieldConfig.prompt}

请用温暖、鼓励、充满希望的语气，直接输出内容，不要有前缀标题。`;

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: [
          "你是一位专业的个人发展顾问，请用摇卦解读这个卦象给出个性化指引。",
          "直接输出内容，不要有标题前缀，不要用Markdown格式。",
          "语气要温暖、鼓励，内容直白，避免使用硬币、卦、卦象、象、此象、运势、爻等字样。",
        ].join(" "),
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("Failed to get field content from LLM");
  }

  return content.trim();
}

export type AppRouter = typeof appRouter;
