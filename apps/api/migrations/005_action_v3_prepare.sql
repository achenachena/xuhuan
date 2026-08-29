-- Action V3 is a deliberate forward reset. Telegram identity and language are
-- retained while all game truth starts again at the V3 prologue.
TRUNCATE TABLE run_commands, runs, story_choices, player_unlocks, player_progress;

-- Immutable history rows may only disappear as part of a parent-player/run
-- cascade. This keeps direct UPDATE/DELETE attempts rejected while allowing
-- production smoke identities to be removed without orphaning history.
CREATE OR REPLACE FUNCTION reject_immutable_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION '% is immutable', TG_TABLE_NAME;
END;
$$;

CREATE TABLE player_campaign_progress (
    player_id uuid PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
    current_chapter_slug text NOT NULL DEFAULT 'seventh-dock'
        CHECK (current_chapter_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    story_version integer NOT NULL DEFAULT 3 CHECK (story_version >= 3),
    story_flags jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(story_flags) = 'object'),
    trust integer NOT NULL DEFAULT 0,
    authenticity integer NOT NULL DEFAULT 0,
    retention integer NOT NULL DEFAULT 0,
    ending text CHECK (ending IN ('authentic', 'balanced', 'retained')),
    daily_unlocked boolean NOT NULL DEFAULT false,
    version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE player_chapter_progress (
    player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    chapter_slug text NOT NULL CHECK (chapter_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    highest_noise_level integer NOT NULL DEFAULT 0 CHECK (highest_noise_level BETWEEN 0 AND 3),
    clears integer NOT NULL DEFAULT 0 CHECK (clears >= 0),
    best_score integer NOT NULL DEFAULT 0 CHECK (best_score >= 0),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (player_id, chapter_slug)
);

DROP TRIGGER IF EXISTS story_choices_immutable ON story_choices;
ALTER TABLE story_choices DROP CONSTRAINT IF EXISTS story_choices_player_id_scene_slug_key;
ALTER TABLE story_choices
    ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
    ADD COLUMN trust integer NOT NULL DEFAULT 0,
    ADD COLUMN authenticity integer NOT NULL DEFAULT 0,
    ADD COLUMN retention integer NOT NULL DEFAULT 0;
ALTER TABLE story_choices ADD CONSTRAINT story_choices_player_scene_revision_key
    UNIQUE (player_id, scene_slug, revision);
CREATE TRIGGER story_choices_immutable BEFORE UPDATE OR DELETE ON story_choices
FOR EACH ROW EXECUTE FUNCTION reject_immutable_mutation();

DROP INDEX IF EXISTS runs_one_active_player_idx;
ALTER TABLE runs
    ADD COLUMN run_mode text NOT NULL DEFAULT 'campaign' CHECK (run_mode IN ('campaign', 'daily')),
    ADD COLUMN daily_date date,
    ADD CONSTRAINT runs_daily_shape_check CHECK (
        (run_mode = 'campaign' AND daily_date IS NULL) OR
        (run_mode = 'daily' AND daily_date IS NOT NULL)
    );
CREATE UNIQUE INDEX runs_one_active_mode_idx ON runs (player_id, run_mode) WHERE status = 'active';

ALTER TABLE run_commands DROP CONSTRAINT run_commands_command_type_check;
ALTER TABLE run_commands ADD CONSTRAINT run_commands_command_type_check CHECK (command_type IN (
    'choose_node', 'complete_encounter', 'choose_module_reward',
    'reroll_module_reward', 'resolve_event', 'rest', 'abandon_run'
));

CREATE TABLE daily_results (
    player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    daily_date date NOT NULL,
    run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    character_slug text NOT NULL CHECK (character_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    score integer NOT NULL CHECK (score >= 0),
    build jsonb NOT NULL CHECK (jsonb_typeof(build) = 'object'),
    streak integer NOT NULL DEFAULT 1 CHECK (streak >= 1),
    completed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (player_id, daily_date),
    UNIQUE (run_id)
);

INSERT INTO player_campaign_progress (player_id) SELECT id FROM players ON CONFLICT DO NOTHING;
INSERT INTO player_unlocks (player_id, unlock_type, content_slug)
SELECT id, 'character', 'nana7mi' FROM players ON CONFLICT DO NOTHING;
