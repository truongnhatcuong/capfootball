-- Defense in depth for concurrency and invalid data outside the application.
CREATE UNIQUE INDEX "one_accepted_request_per_match" ON "MatchRequest" ("matchId") WHERE "status" = 'ACCEPTED';
ALTER TABLE "Match" ADD CONSTRAINT "match_fee_nonnegative" CHECK ("fee" IS NULL OR "fee" >= 0);
ALTER TABLE "Match" ADD CONSTRAINT "match_skill_range" CHECK ("skillMax" IS NULL OR "skillMax" >= "skill");
ALTER TABLE "Venue" ADD CONSTRAINT "venue_coordinates_valid" CHECK (
  ("lat" IS NULL AND "lng" IS NULL) OR
  ("lat" IS NOT NULL AND "lng" IS NOT NULL AND "lat" BETWEEN -90 AND 90 AND "lng" BETWEEN -180 AND 180)
);
ALTER TABLE "Rating" ADD CONSTRAINT "rating_outcome_valid" CHECK (
  ("happened" AND NOT "noShow" AND "stars" BETWEEN 1 AND 5 AND "stars" IS NOT NULL) OR
  (NOT "happened" AND "stars" IS NULL)
);
ALTER TABLE "UserBlock" ADD CONSTRAINT "cannot_block_self" CHECK ("blockerId" <> "blockedId");
