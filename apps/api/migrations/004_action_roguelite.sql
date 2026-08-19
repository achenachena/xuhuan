-- The action rebuild is a forward-only V2 protocol replacement. The product
-- decision is to restart every Telegram identity from the new one-tap prologue.
TRUNCATE TABLE players CASCADE;

ALTER TABLE player_progress
    ALTER COLUMN story_version SET DEFAULT 2;

ALTER TABLE run_commands
    ADD COLUMN command_payload jsonb NOT NULL
        CHECK (jsonb_typeof(command_payload) = 'object');

ALTER TABLE player_unlocks
    DROP CONSTRAINT player_unlocks_unlock_type_check,
    ADD CONSTRAINT player_unlocks_unlock_type_check
        CHECK (unlock_type IN ('character', 'module', 'plugin', 'starter_module'));

ALTER TABLE run_commands
    DROP CONSTRAINT run_commands_command_type_check,
    ADD CONSTRAINT run_commands_command_type_check CHECK (command_type IN (
        'choose_node', 'complete_encounter', 'choose_module_reward',
        'resolve_event', 'rest', 'abandon_run'
    ));
