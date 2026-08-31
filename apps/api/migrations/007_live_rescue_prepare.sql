-- Live Rescue V4 keeps Telegram identity and language but deliberately resets
-- game truth. Action V3 columns remain through this prepare boundary so the
-- previous Lambda can be selected during the short maintenance window.
TRUNCATE TABLE daily_results, run_commands, runs, story_choices, player_unlocks,
    player_chapter_progress, player_campaign_progress;

ALTER TABLE player_campaign_progress
    ALTER COLUMN story_version SET DEFAULT 4;
ALTER TABLE player_campaign_progress DROP CONSTRAINT player_campaign_progress_ending_check;
ALTER TABLE player_campaign_progress ADD CONSTRAINT player_campaign_progress_ending_check CHECK (
    ending IN ('authentic', 'balanced', 'retained', 'open-archive', 'shared-cut', 'quiet-signoff')
);

ALTER TABLE player_chapter_progress
    ADD COLUMN highest_encore_level integer NOT NULL DEFAULT 0
        CHECK (highest_encore_level BETWEEN 0 AND 3);

ALTER TABLE runs
    ADD COLUMN encore_level integer NOT NULL DEFAULT 0
        CHECK (encore_level BETWEEN 0 AND 3),
    ADD COLUMN start_request_payload jsonb
        CHECK (jsonb_typeof(start_request_payload) = 'object');
ALTER TABLE runs ALTER COLUMN start_request_hash DROP NOT NULL;
ALTER TABLE runs ALTER COLUMN noise_level SET DEFAULT 0;

ALTER TABLE run_commands ALTER COLUMN request_hash DROP NOT NULL;
ALTER TABLE story_choices ALTER COLUMN request_hash DROP NOT NULL;

ALTER TABLE run_commands DROP CONSTRAINT run_commands_command_type_check;
ALTER TABLE run_commands ADD CONSTRAINT run_commands_command_type_check CHECK (command_type IN (
    'choose_node', 'complete_encounter', 'choose_module_reward',
    'reroll_module_reward', 'resolve_event', 'rest',
    'complete_segment', 'choose_show_option', 'choose_intermission_reply',
    'abandon_run'
));

ALTER TABLE player_unlocks DROP CONSTRAINT player_unlocks_unlock_type_check;
ALTER TABLE player_unlocks ADD CONSTRAINT player_unlocks_unlock_type_check CHECK (unlock_type IN (
    'character', 'module', 'plugin', 'starter_module', 'companion', 'memory_clip'
));

INSERT INTO player_campaign_progress (player_id, story_version)
SELECT id, 4 FROM players ON CONFLICT DO NOTHING;
INSERT INTO player_chapter_progress (player_id, chapter_slug)
SELECT id, 'seventh-dock' FROM players ON CONFLICT DO NOTHING;
INSERT INTO player_unlocks (player_id, unlock_type, content_slug)
SELECT id, 'character', 'nana7mi' FROM players ON CONFLICT DO NOTHING;
