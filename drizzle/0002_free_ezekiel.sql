CREATE TABLE `app_counters` (
	`name` text PRIMARY KEY NOT NULL,
	`value` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`summary` text NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_logs_created_at_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `audit_logs_entity_idx` ON `audit_logs` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `clients` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`archived_at` integer,
	`archived_by` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clients_normalized_name_idx` ON `clients` (`normalized_name`);--> statement-breakpoint
CREATE INDEX `clients_status_idx` ON `clients` (`status`);--> statement-breakpoint
CREATE TABLE `drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`client_request_id` text NOT NULL,
	`user_id` text NOT NULL,
	`client_id` text,
	`client_name` text DEFAULT '' NOT NULL,
	`data_json` text NOT NULL,
	`step` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `drafts_client_request_idx` ON `drafts` (`client_request_id`);--> statement-breakpoint
CREATE INDEX `drafts_user_id_idx` ON `drafts` (`user_id`);--> statement-breakpoint
CREATE INDEX `drafts_updated_at_idx` ON `drafts` (`updated_at`);--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`username` text PRIMARY KEY NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `login_attempts_updated_at_idx` ON `login_attempts` (`updated_at`);--> statement-breakpoint
CREATE TABLE `order_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`revision_number` integer NOT NULL,
	`data_json` text NOT NULL,
	`reason` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `order_revisions_order_revision_idx` ON `order_revisions` (`order_id`,`revision_number`);--> statement-breakpoint
CREATE INDEX `order_revisions_order_id_idx` ON `order_revisions` (`order_id`);--> statement-breakpoint
ALTER TABLE `orders` ADD `client_id` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `client_request_id` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `revision_number` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `corrected_from_id` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `correction_reason` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `superseded_by_id` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `finalized_at` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `signed_at` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `consent_confirmed` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `deleted_at` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `deleted_by` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `deletion_reason` text;--> statement-breakpoint
CREATE UNIQUE INDEX `orders_client_request_idx` ON `orders` (`client_request_id`);--> statement-breakpoint
CREATE INDEX `orders_deleted_at_idx` ON `orders` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `orders_client_id_idx` ON `orders` (`client_id`);--> statement-breakpoint
CREATE INDEX `orders_superseded_by_idx` ON `orders` (`superseded_by_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `display_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `password_iterations` integer DEFAULT 100000 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `role` text DEFAULT 'technician' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `must_change_password` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `failed_login_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `locked_until` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `updated_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `users_status_idx` ON `users` (`status`);--> statement-breakpoint
UPDATE `users`
SET `display_name` = `username`,
    `updated_at` = CASE WHEN `created_at` > 0 THEN `created_at` ELSE 0 END,
    `role` = CASE WHEN lower(`username`) IN ('admin') THEN 'admin' ELSE 'technician' END;--> statement-breakpoint
UPDATE `orders`
SET `finalized_at` = `created_at`,
    `signed_at` = `created_at`,
    `consent_confirmed` = 1
WHERE `finalized_at` IS NULL;--> statement-breakpoint
INSERT OR IGNORE INTO `clients` (`id`, `name`, `normalized_name`, `status`, `created_at`, `updated_at`, `created_by`) VALUES
('client-001', 'Mercado Aurora', 'mercado aurora', 'active', 0, 0, 'migration'),
('client-002', 'Padaria Bom Grão', 'padaria bom grao', 'active', 0, 0, 'migration'),
('client-003', 'Empório Serra Azul', 'emporio serra azul', 'active', 0, 0, 'migration'),
('client-004', 'Panificadora Trigo Fino', 'panificadora trigo fino', 'active', 0, 0, 'migration'),
('client-005', 'Supermercado Boa Vista', 'supermercado boa vista', 'active', 0, 0, 'migration'),
('client-006', 'Açougue Nobre', 'acougue nobre', 'active', 0, 0, 'migration'),
('client-007', 'Doceria Canela', 'doceria canela', 'active', 0, 0, 'migration'),
('client-008', 'Padaria Sol Nascente Centro', 'padaria sol nascente centro', 'active', 0, 0, 'migration'),
('client-009', 'Mercado Vila Nova 1', 'mercado vila nova 1', 'active', 0, 0, 'migration'),
('client-010', 'Frigorífico Campo Belo', 'frigorifico campo belo', 'active', 0, 0, 'migration'),
('client-011', 'Pão de Mel', 'pao de mel', 'active', 0, 0, 'migration'),
('client-012', 'Mercearia Horizonte', 'mercearia horizonte', 'active', 0, 0, 'migration'),
('client-013', 'Padaria Sol Nascente Litoral', 'padaria sol nascente litoral', 'active', 0, 0, 'migration'),
('client-014', 'Empório Ipê', 'emporio ipe', 'active', 0, 0, 'migration'),
('client-015', 'Massas da Nonna', 'massas da nonna', 'active', 0, 0, 'migration'),
('client-016', 'Mercado Jardim', 'mercado jardim', 'active', 0, 0, 'migration'),
('client-017', 'Padaria Estrela Guia', 'padaria estrela guia', 'active', 0, 0, 'migration'),
('client-018', 'Distribuidora Rota Sul', 'distribuidora rota sul', 'active', 0, 0, 'migration'),
('client-019', 'Confeitaria Lumière', 'confeitaria lumiere', 'active', 0, 0, 'migration'),
('client-020', 'Hortifruti Verde Vale Norte', 'hortifruti verde vale norte', 'active', 0, 0, 'migration'),
('client-021', 'Hortifruti Verde Vale Sul', 'hortifruti verde vale sul', 'active', 0, 0, 'migration'),
('client-022', 'Hortifruti Verde Vale Paraíso', 'hortifruti verde vale paraiso', 'active', 0, 0, 'migration'),
('client-023', 'Hortifruti Verde Vale Aclimação', 'hortifruti verde vale aclimacao', 'active', 0, 0, 'migration'),
('client-024', 'Hortifruti Verde Vale Leste', 'hortifruti verde vale leste', 'active', 0, 0, 'migration'),
('client-025', 'Mercado Vila Nova 2', 'mercado vila nova 2', 'active', 0, 0, 'migration');--> statement-breakpoint
UPDATE `orders`
SET `client_id` = (
  SELECT `clients`.`id`
  FROM `clients`
  WHERE lower(`clients`.`name`) = lower(`orders`.`client_name`)
  LIMIT 1
)
WHERE `client_id` IS NULL;--> statement-breakpoint
INSERT OR IGNORE INTO `app_counters` (`name`, `value`)
SELECT 'order_number', COALESCE(MAX(`order_number`), 0) FROM `orders`;
