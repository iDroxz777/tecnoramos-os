CREATE TABLE `service_cycle_completions` (
	`id` text PRIMARY KEY NOT NULL,
	`cycle_id` text NOT NULL,
	`client_name` text NOT NULL,
	`order_id` text,
	`completed_at` integer NOT NULL,
	`completed_by` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `service_cycle_client_idx` ON `service_cycle_completions` (`cycle_id`,`client_name`);--> statement-breakpoint
CREATE INDEX `service_cycle_completions_cycle_idx` ON `service_cycle_completions` (`cycle_id`);--> statement-breakpoint
CREATE TABLE `service_cycles` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`started_at` integer NOT NULL,
	`started_by` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `service_cycles_active_idx` ON `service_cycles` (`is_active`);