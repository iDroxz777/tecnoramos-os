CREATE TABLE `order_reviews` (
	`order_id` text PRIMARY KEY NOT NULL,
	`reviewed_at` integer NOT NULL,
	`reviewed_by` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `order_reviews_reviewed_at_idx` ON `order_reviews` (`reviewed_at`);