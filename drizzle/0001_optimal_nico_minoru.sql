CREATE TABLE `settlement_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`from_member` text NOT NULL,
	`to_member` text NOT NULL,
	`amount` integer NOT NULL,
	`payment_method` text NOT NULL,
	`request_date` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`responded_at` text,
	`settlement_id` text
);
