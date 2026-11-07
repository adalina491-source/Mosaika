CREATE TABLE `mosaika_instagram_connection` (
	`id` int AUTO_INCREMENT NOT NULL,
	`instagramId` varchar(80) NOT NULL,
	`username` varchar(255) NOT NULL,
	`profilePictureUrl` text,
	`followersCount` int,
	`accessToken` text NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mosaika_instagram_connection_id` PRIMARY KEY(`id`),
	CONSTRAINT `mosaika_instagram_connection_instagramId_unique` UNIQUE(`instagramId`)
);
--> statement-breakpoint
CREATE TABLE `mosaika_oauth_states` (
	`stateHash` varchar(64) NOT NULL,
	`returnUri` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mosaika_oauth_states_stateHash` PRIMARY KEY(`stateHash`)
);
--> statement-breakpoint
CREATE TABLE `mosaika_posts` (
	`id` varchar(64) NOT NULL,
	`kind` varchar(32) NOT NULL,
	`caption` text,
	`mediaKeys` text NOT NULL,
	`status` varchar(24) NOT NULL DEFAULT 'draft',
	`remoteId` varchar(100),
	`scheduledAt` timestamp,
	`heartbeatUid` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`publishedAt` timestamp,
	CONSTRAINT `mosaika_posts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mosaika_sessions` (
	`tokenHash` varchar(64) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mosaika_sessions_tokenHash` PRIMARY KEY(`tokenHash`)
);
