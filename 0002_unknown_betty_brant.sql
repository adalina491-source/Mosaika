ALTER TABLE `mosaika_instagram_connection` MODIFY COLUMN `accessToken` longtext NOT NULL;--> statement-breakpoint
ALTER TABLE `mosaika_instagram_connection` ADD `clientBusinessId` varchar(80);--> statement-breakpoint
ALTER TABLE `mosaika_instagram_connection` ADD `configId` varchar(100);