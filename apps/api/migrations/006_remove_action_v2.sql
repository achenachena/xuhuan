-- V3 production validation is complete. Remove tables that only served the
-- original battle and Action V2 rollback paths; ordered migration history stays.
DROP TABLE IF EXISTS player_progress;
DROP TABLE IF EXISTS player_ledger;
DROP TABLE IF EXISTS idempotency_records;
DROP TABLE IF EXISTS battle_actions;
DROP TABLE IF EXISTS battles;
DROP TABLE IF EXISTS encounters;
DROP TABLE IF EXISTS characters;

ALTER TABLE players
    DROP COLUMN username,
    DROP COLUMN first_name,
    DROP COLUMN last_name;
