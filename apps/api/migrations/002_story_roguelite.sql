-- The roguelite rebuild intentionally starts every Telegram identity from the
-- prologue. Legacy tables remain during the compatibility release so the
-- previous Lambda version can still be selected while V2 is being verified.
TRUNCATE TABLE players CASCADE;

CREATE TABLE player_progress (
    player_id uuid PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
    current_chapter_slug text NOT NULL DEFAULT 'seventh-dock'
        CHECK (current_chapter_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    highest_noise_level integer NOT NULL DEFAULT 0 CHECK (highest_noise_level BETWEEN 0 AND 10),
    story_version integer NOT NULL DEFAULT 1 CHECK (story_version >= 1),
    story_flags jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(story_flags) = 'object'),
    version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE player_unlocks (
    player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    unlock_type text NOT NULL CHECK (unlock_type IN ('character', 'card', 'relic', 'starter_module')),
    content_slug text NOT NULL CHECK (content_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (player_id, unlock_type, content_slug)
);

CREATE TABLE story_choices (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    scene_slug text NOT NULL CHECK (scene_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    option_slug text NOT NULL CHECK (option_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    choice_tag text NOT NULL CHECK (choice_tag ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    expected_version bigint NOT NULL CHECK (expected_version >= 1),
    resulting_version bigint NOT NULL CHECK (resulting_version = expected_version + 1),
    idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 128),
    request_hash bytea NOT NULL CHECK (octet_length(request_hash) = 32),
    result_snapshot jsonb NOT NULL CHECK (jsonb_typeof(result_snapshot) = 'object'),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (player_id, scene_slug),
    UNIQUE (player_id, idempotency_key)
);

CREATE TABLE runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    content_version text NOT NULL CHECK (content_version ~ '^v[1-9][0-9]*$'),
    chapter_slug text NOT NULL CHECK (chapter_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    character_slug text NOT NULL CHECK (character_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    noise_level integer NOT NULL CHECK (noise_level BETWEEN 0 AND 10),
    seed text NOT NULL CHECK (length(seed) BETWEEN 16 AND 256),
    state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object'),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),
    outcome text CHECK (outcome IN ('cleared', 'failed', 'abandoned')),
    version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
    start_idempotency_key text NOT NULL CHECK (length(start_idempotency_key) BETWEEN 8 AND 128),
    start_request_hash bytea NOT NULL CHECK (octet_length(start_request_hash) = 32),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    CHECK (
        (status = 'active' AND outcome IS NULL AND completed_at IS NULL)
        OR (status IN ('completed', 'abandoned') AND outcome IS NOT NULL AND completed_at IS NOT NULL)
    ),
    UNIQUE (player_id, start_idempotency_key)
);

CREATE UNIQUE INDEX runs_one_active_player_idx ON runs (player_id) WHERE status = 'active';
CREATE INDEX runs_player_created_idx ON runs (player_id, created_at DESC);

CREATE TABLE run_commands (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    sequence integer NOT NULL CHECK (sequence > 0),
    command_type text NOT NULL CHECK (command_type IN (
        'choose_node', 'play_card', 'end_turn', 'choose_card_reward',
        'resolve_event', 'rest', 'abandon_run'
    )),
    expected_version bigint NOT NULL CHECK (expected_version >= 1),
    resulting_version bigint NOT NULL CHECK (resulting_version = expected_version + 1),
    idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 128),
    request_hash bytea NOT NULL CHECK (octet_length(request_hash) = 32),
    result_snapshot jsonb NOT NULL CHECK (jsonb_typeof(result_snapshot) = 'object'),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (run_id, sequence),
    UNIQUE (run_id, idempotency_key)
);

CREATE INDEX run_commands_player_created_idx ON run_commands (player_id, created_at DESC);

CREATE TRIGGER story_choices_immutable
BEFORE UPDATE OR DELETE ON story_choices
FOR EACH ROW EXECUTE FUNCTION reject_immutable_mutation();

CREATE TRIGGER run_commands_immutable
BEFORE UPDATE OR DELETE ON run_commands
FOR EACH ROW EXECUTE FUNCTION reject_immutable_mutation();
