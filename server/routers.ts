import { router, publicProcedure } from "./_core/trpc";
import { z } from "zod";
import { invokeLLM } from "./_core/llm";
import {
  createCoinReading,
  updateCoinReadingAnalysis,
  getDeviceCoinReadings,
  getOrCreateDevice,
  getTodaysCoinReading,
  updateDeviceLastToss,
  getTodaysUsageCount,
} from "./db";

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
  const now = new Date();
  const hour = now.getHours();
  
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
     * 获取今日运势
     * 基于设备指纹，每天只投掷一次
     * 如果当天已投掷过，返回缓存结果
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

          // 获取今天的日期（YYYY-MM-DD格式）
          const today = new Date();
          const todayDate = new Date(
            today.getFullYear(),
            today.getMonth(),
            today.getDate()
          );

          // 检查是否已有今天的投掷记录
          const existingReading = await getTodaysCoinReading(device.id, todayDate);
          if (existingReading && existingReading.analysis) {
            return {
              id: existingReading.id,
              coinResults: existingReading.coinResults,
              analysis: existingReading.analysis,
              isCached: true,
            };
          }

          // 执行新的投掷和分析
          const result = await performNewToss(device.id, todayDate);

          // 更新设备的最后投掷日期
          await updateDeviceLastToss(device.id, result.id, todayDate);

          return result;
        } catch (error) {
          console.error("[Coin] Get today error:", error);
          throw error;
        }
      }),

    /**
     * 解答小困惑
     * 根据用户的问题和硬币结果提供LLM生成的解读
     * 每天限制3次
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

          // 获取今天的日期
          const today = new Date();
          const todayDate = new Date(
            today.getFullYear(),
            today.getMonth(),
            today.getDate()
          );

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
              "阴爻",
              "少阳",
              "少阴",
              "阳爻",
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
                  "请根据六爻卦象解读这个问题，直接说结论，不要说卦象和分析过程，请用温暖、鼓励的语气，语言要直白，不要用古语，比如\"您所问之事\"\"并无大碍\"\"宜\"\"不宜\"，但需要进行个性化分析，不要有括号内的解释。不要使用'硬币'、'卦'、'卦象'、'象'、'此象'、'运势'、'爻'等词汇。一定不要出现'硬币'、'卦'、'卦象'、'象'、'此象'、'运势'、'爻'几个字",
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
          const { recordQuestionTagClick } = await import("./db");
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
          const { getTodayHotQuestions } = await import("./db");
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
 * 执行新的投掷和分析
 */
async function performNewToss(
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

  // 构建LLM提示词
  const prompt = buildAnalysisPrompt(coinResults);

  // 调用LLM进行分析
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content:
          [
            "你是一位专业的个人发展顾问，基于提供的数字特征给出个性化指引。",
            "必须严格输出 JSON，键名只能是 greeting/outfit/color/mood/career/love/luck，对应值为简洁中文字符串；不得输出 Markdown、解释、思维链、额外字段。",
            "语气要温暖、鼓励，内容直白，避免使用“硬币/卦/卦象/象/此象/运势/爻”等字样。",
          ].join(" "),
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "fortune_analysis",
        strict: true,
        schema: {
          type: "object",
          properties: {
            greeting: {
              type: "string",
              description: "早安心语：温暖的早安祝福",
            },
            outfit: {
              type: "string",
              description: "穿搭灵感：今天适合的穿搭建议",
            },
            color: {
              type: "string",
              description: "幸运配色：推荐的幸运颜色和其含义",
            },
            mood: {
              type: "string",
              description: "情绪流动：今天的情绪特点和调整建议",
            },
            career: {
              type: "string",
              description: "工作指引：工作方面的建议",
            },
            love: {
              type: "string",
              description: "情感气场：人际关系和情感方面的建议",
            },
            luck: {
              type: "string",
              description: "幸运微光：今天可能的小幸运",
            },
          },
          required: ["greeting", "outfit", "color", "mood", "career", "love", "luck"],
          additionalProperties: false,
        },
      },
    },
  });

  // 解析LLM响应
  const analysisContent = response.choices[0]?.message?.content;
  if (!analysisContent || typeof analysisContent !== 'string') {
    throw new Error("Failed to get analysis from LLM");
  }

  const analysis = JSON.parse(analysisContent);

  // 更新投掷记录的分析结果
  await updateCoinReadingAnalysis(reading.id, analysis);

  return {
    id: reading.id,
    coinResults,
    analysis,
    isCached: false,
  };
}

/**
 * 根据硬币投掷结果构建LLM分析提示词
 */
function buildAnalysisPrompt(coinResults: number[]): string {
  const sum = coinResults.reduce((a, b) => a + b, 0);
  const seedIndex = sum % 4;

  // 构建详细的背景信息
  const resultDescription = coinResults
    .map((val, idx) => {
      const descriptions = [
        "三个反面",
        "两个反面一个正面",
        "一个反面两个正面",
        "三个正面",
      ];
      return `位置${idx + 1}：${descriptions[val]}（值${val}）`;
    })
    .join("\n");

  return `用户提供了一些数字特征，具体如下：

${resultDescription}

总值：${sum}
能量指数：${seedIndex}（0-3之间，0表示静谦，3表示活力）

请根据这些特征，为用户提供个性化的指引。分析应该包括：
1. 早安心语：温暖的早安祝福和鼓励
2. 穿搭灵感：根据能量指数推荐的穿搭风格
3. 幸运配色：推荐的幸运颜色和其含义
4. 情绪流动：今天的情绪特点
5. 工作指引：工作方面的建议
6. 情感气场：人际关系和情感方面的建议
7. 幸运微光：今天可能的小幸运

请用温暖、鼓励、充满希望的语气进行分析。`;
}

export type AppRouter = typeof appRouter;
