-- V2 has passed the signed production journey gate. This contract migration
-- intentionally removes the now-unrecoverable V1 gameplay schema while
-- preserving players, V2 progression/runs, and the immutable-history helper
-- used by story_choices and run_commands.
DROP TABLE player_ledger;
DROP TABLE battle_actions;
DROP TABLE idempotency_records;
DROP TABLE battles;
DROP TABLE encounters;
DROP TABLE characters;
DROP TABLE admin_audit_events;

ALTER TABLE players
    DROP COLUMN level,
    DROP COLUMN experience,
    DROP COLUMN credits,
    DROP COLUMN energy,
    DROP COLUMN version;
