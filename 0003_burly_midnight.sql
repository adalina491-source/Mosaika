CREATE TABLE `mosaika_oauth_tickets` (
	`ticketHash` varchar(64) NOT NULL,
	`codeChallenge` varchar(43) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mosaika_oauth_tickets_ticketHash` PRIMARY KEY(`ticketHash`)
);
--> statement-breakpoint
ALTER TABLE `mosaika_oauth_states` ADD `codeChallenge` varchar(43) NOT NULL;