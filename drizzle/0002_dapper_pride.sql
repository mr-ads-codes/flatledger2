CREATE TABLE `settlement_month_overrides` (
	`request_id` text PRIMARY KEY NOT NULL,
	`settlement_month` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `settlement_requests` ADD `settlement_month` text;
--> statement-breakpoint
INSERT OR IGNORE INTO `settlement_month_overrides` (`request_id`, `settlement_month`, `reason`, `created_at`)
SELECT sr.`id`, '2026-07', 'Confirmed correction: Zulkaif Ahsan to Ziyyad Bin Khalid, PKR 1350', datetime('now')
FROM `settlement_requests` sr
JOIN `members` sender ON sender.`id` = sr.`from_member`
JOIN `members` receiver ON receiver.`id` = sr.`to_member`
WHERE lower(trim(sender.`name`)) = lower('Zulkaif Ahsan')
  AND lower(trim(receiver.`name`)) = lower('Ziyyad Bin Khalid')
  AND sr.`amount` = 1350
  AND sr.`status` = 'accepted'
ORDER BY sr.`created_at` DESC
LIMIT 1;
