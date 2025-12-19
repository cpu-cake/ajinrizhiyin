import { int, mysqlTable, text, timestamp, varchar, json, date } from "drizzle-orm/mysql-core";

/**
 * 设备信息表
 * 基于设备指纹识别，实现每天一次的投掷逻辑
 */
export const devices = mysqlTable("devices", {
  id: int("id").autoincrement().primaryKey(),
  // 设备指纹：基于浏览器UA、语言、时区等信息生成
  deviceFingerprint: varchar("deviceFingerprint", { length: 255 }).notNull().unique(),
  // 最后一次投掷的日期
  lastTossDate: date("lastTossDate"),
  // 最后一次投掷的结果ID
  lastReadingId: int("lastReadingId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Device = typeof devices.$inferSelect;
export type InsertDevice = typeof devices.$inferInsert;

/**
 * 硬币投掷记录表
 * 存储硬币投掷结果和LLM分析
 */
export const coinReadings = mysqlTable("coin_readings", {
  id: int("id").autoincrement().primaryKey(),
  // 设备ID
  deviceId: int("deviceId"),
  // 硬币投掷结果：6个数字，每个数字表示该爻的背数（0-3）
  // 例如：[2, 1, 3, 0, 2, 1] 表示六爻的投掷结果
  coinResults: json("coinResults").$type<number[]>().notNull(),
  // LLM分析的结果，包含各个方面的运势解读
  // 字段可选，支持分步加载
  analysis: json("analysis").$type<{
    greeting?: string;
    outfit?: string;
    color?: string;
    mood?: string;
    career?: string;
    love?: string;
    luck?: string;
  }>(),
  // 投掷日期
  tossDate: date("tossDate").notNull(),
  // 记录类型：daily_fortune 表示今日运势，question_answer 表示解答小困惑
  type: varchar("type", { length: 50 }).default("daily_fortune").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CoinReading = typeof coinReadings.$inferSelect;
export type InsertCoinReading = typeof coinReadings.$inferInsert;

/**
 * 标签点击记录表
 * 记录每个标签的点击次数
 */
export const questionTagClicks = mysqlTable("question_tag_clicks", {
  id: int("id").autoincrement().primaryKey(),
  // 标签文字
  questionText: varchar("questionText", { length: 255 }).notNull(),
  // 设备指纹（可选，用于去重或分析）
  deviceFingerprint: varchar("deviceFingerprint", { length: 255 }),
  // 点击日期
  clickDate: date("clickDate").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type QuestionTagClick = typeof questionTagClicks.$inferSelect;
export type InsertQuestionTagClick = typeof questionTagClicks.$inferInsert;

/**
 * 热门标签表
 * 每天凌晨4点统计前一天最热门的5个标签
 */
export const hotQuestions = mysqlTable("hot_questions", {
  id: int("id").autoincrement().primaryKey(),
  // 标签文字
  questionText: varchar("questionText", { length: 255 }).notNull(),
  // 点击次数
  clickCount: int("clickCount").notNull(),
  // 统计日期（哪一天的数据）
  statsDate: date("statsDate").notNull(),
  // 排名（1-5）
  rank: int("rank").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type HotQuestion = typeof hotQuestions.$inferSelect;
export type InsertHotQuestion = typeof hotQuestions.$inferInsert;
