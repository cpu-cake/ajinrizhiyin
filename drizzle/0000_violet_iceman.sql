CREATE TABLE `coin_readings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`deviceId` int,
	`coinResults` json NOT NULL,
	`analysis` json,
	`tossDate` date NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `coin_readings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `devices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`deviceFingerprint` varchar(255) NOT NULL,
	`lastTossDate` date,
	`lastReadingId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `devices_id` PRIMARY KEY(`id`),
	CONSTRAINT `devices_deviceFingerprint_unique` UNIQUE(`deviceFingerprint`)
);
