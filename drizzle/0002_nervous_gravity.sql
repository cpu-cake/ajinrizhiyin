CREATE TABLE `hot_questions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`questionText` varchar(255) NOT NULL,
	`clickCount` int NOT NULL,
	`statsDate` date NOT NULL,
	`rank` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `hot_questions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `question_tag_clicks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`questionText` varchar(255) NOT NULL,
	`deviceFingerprint` varchar(255),
	`clickDate` date NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `question_tag_clicks_id` PRIMARY KEY(`id`)
);
