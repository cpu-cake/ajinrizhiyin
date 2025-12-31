import { integer, pgTable, text, timestamp, varchar, json, date, serial } from "drizzle-orm/pg-core";

/**
 * 设备信息表
 * 基于设备指纹识别，实现每天一次的投掷逻辑
 */
export const devices = pgTable("devices", {
  id: serial("id").primaryKey(),
  // 设备指纹：基于浏览器UA、语言、时区等信息生成
  deviceFingerprint: varchar("device_fingerprint", { length: 255 }).notNull().unique(),
  // 最后一次投掷的日期
  lastTossDate: date("last_toss_date"),
  // 最后一次投掷的结果ID
  lastReadingId: integer("last_reading_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Device = typeof devices.$inferSelect;
export type InsertDevice = typeof devices.$inferInsert;

/**
 * 硬币投掷记录表
 * 存储硬币投掷结果和LLM分析
 */
export const coinReadings = pgTable("coin_readings", {
  id: serial("id").primaryKey(),
  // 设备ID
  deviceId: integer("device_id"),
  // 硬币投掷结果：6个数字，每个数字表示该爻的背数（0-3）
  coinResults: json("coin_results").$type<number[]>().notNull(),
  // LLM分析的结果
  analysis: json("analysis").$type<{
    greeting: string;
    outfit: string;
    color: string;
    mood: string;
    career: string;
    love: string;
    luck: string;
  }>(),
  // 投掷日期
  tossDate: date("toss_date").notNull(),
  // 记录类型：daily_fortune 或 question_answer
  type: varchar("type", { length: 50 }).default("daily_fortune").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type CoinReading = typeof coinReadings.$inferSelect;
export type InsertCoinReading = typeof coinReadings.$inferInsert;

/**
 * 标签点击记录表
 */
export const questionTagClicks = pgTable("question_tag_clicks", {
  id: serial("id").primaryKey(),
  questionText: varchar("question_text", { length: 255 }).notNull(),
  deviceFingerprint: varchar("device_fingerprint", { length: 255 }),
  clickDate: date("click_date").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type QuestionTagClick = typeof questionTagClicks.$inferSelect;
export type InsertQuestionTagClick = typeof questionTagClicks.$inferInsert;

/**
 * 热门标签表
 */
export const hotQuestions = pgTable("hot_questions", {
  id: serial("id").primaryKey(),
  questionText: varchar("question_text", { length: 255 }).notNull(),
  clickCount: integer("click_count").notNull(),
  statsDate: date("stats_date").notNull(),
  rank: integer("rank").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type HotQuestion = typeof hotQuestions.$inferSelect;
export type InsertHotQuestion = typeof hotQuestions.$inferInsert;
