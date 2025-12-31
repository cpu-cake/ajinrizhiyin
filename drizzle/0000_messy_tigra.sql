CREATE TABLE "coin_readings" (
	"id" serial PRIMARY KEY NOT NULL,
	"device_id" integer,
	"coin_results" json NOT NULL,
	"analysis" json,
	"toss_date" date NOT NULL,
	"type" varchar(50) DEFAULT 'daily_fortune' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" serial PRIMARY KEY NOT NULL,
	"device_fingerprint" varchar(255) NOT NULL,
	"last_toss_date" date,
	"last_reading_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "devices_device_fingerprint_unique" UNIQUE("device_fingerprint")
);
--> statement-breakpoint
CREATE TABLE "hot_questions" (
	"id" serial PRIMARY KEY NOT NULL,
	"question_text" varchar(255) NOT NULL,
	"click_count" integer NOT NULL,
	"stats_date" date NOT NULL,
	"rank" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_tag_clicks" (
	"id" serial PRIMARY KEY NOT NULL,
	"question_text" varchar(255) NOT NULL,
	"device_fingerprint" varchar(255),
	"click_date" date NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
