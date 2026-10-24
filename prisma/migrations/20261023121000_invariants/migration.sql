-- MySQL 8.4: many NULLs are allowed, but only one ACCEPTED row per match.
CREATE UNIQUE INDEX `one_accepted_request_per_match`
  ON `MatchRequest` ((CASE WHEN `status` = 'ACCEPTED' THEN `matchId` ELSE NULL END));
ALTER TABLE `Match` ADD CONSTRAINT `match_fee_nonnegative` CHECK (`fee` IS NULL OR `fee` >= 0);
-- Explicit ranks avoid comparing the ENUM labels as strings.
ALTER TABLE `Match` ADD CONSTRAINT `match_skill_range` CHECK (
  `skillMax` IS NULL OR
  FIELD(`skillMax`, 'WEAK', 'BELOW_AVG', 'AVERAGE', 'ABOVE_AVG', 'GOOD', 'EXCELLENT') >=
  FIELD(`skill`, 'WEAK', 'BELOW_AVG', 'AVERAGE', 'ABOVE_AVG', 'GOOD', 'EXCELLENT')
);
ALTER TABLE `Venue` ADD CONSTRAINT `venue_coordinates_valid` CHECK (
  (`lat` IS NULL AND `lng` IS NULL) OR
  (`lat` IS NOT NULL AND `lng` IS NOT NULL AND `lat` BETWEEN -90 AND 90 AND `lng` BETWEEN -180 AND 180)
);
ALTER TABLE `Rating` ADD CONSTRAINT `rating_outcome_valid` CHECK (
  (`happened` AND NOT `noShow` AND `stars` BETWEEN 1 AND 5 AND `stars` IS NOT NULL) OR
  (NOT `happened` AND `stars` IS NULL)
);
ALTER TABLE `UserBlock` ADD CONSTRAINT `cannot_block_self` CHECK (`blockerId` <> `blockedId`);
-- Shared transaction lock for preserving the last active administrator.
INSERT INTO `DatabaseLock` (`id`) VALUES (1);
