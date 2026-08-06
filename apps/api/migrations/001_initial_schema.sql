CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE players (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_user_id bigint NOT NULL UNIQUE CHECK (telegram_user_id > 0),
    username text,
    first_name text,
    last_name text,
    language_code text,
    level integer NOT NULL DEFAULT 1 CHECK (level >= 1),
    experience bigint NOT NULL DEFAULT 0 CHECK (experience >= 0),
    credits bigint NOT NULL DEFAULT 0 CHECK (credits >= 0),
    energy integer NOT NULL DEFAULT 120 CHECK (energy BETWEEN 0 AND 180),
    version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE characters (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    name_zh_cn text NOT NULL,
    name_en text NOT NULL,
    biography_zh_cn text NOT NULL,
    biography_en text NOT NULL,
    archetype text NOT NULL,
    base_health integer NOT NULL CHECK (base_health > 0),
    base_attack integer NOT NULL CHECK (base_attack > 0),
    base_defense integer NOT NULL CHECK (base_defense >= 0),
    base_speed integer NOT NULL CHECK (base_speed > 0),
    base_crit_rate double precision NOT NULL CHECK (base_crit_rate BETWEEN 0 AND 1),
    base_crit_damage double precision NOT NULL CHECK (base_crit_damage >= 0),
    special_move_name_zh_cn text NOT NULL,
    special_move_name_en text NOT NULL,
    special_move_description_zh_cn text NOT NULL,
    special_move_description_en text NOT NULL,
    special_move_type text NOT NULL,
    rarity text NOT NULL CHECK (rarity IN ('common', 'rare', 'epic', 'legendary')),
    color_theme text NOT NULL CHECK (color_theme ~ '^#[0-9A-Fa-f]{6}$'),
    portrait_url text NOT NULL CHECK (portrait_url ~ '^https://'),
    model_url text NOT NULL CHECK (model_url ~ '^https://'),
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE encounters (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    name_zh_cn text NOT NULL,
    name_en text NOT NULL,
    description_zh_cn text NOT NULL,
    description_en text NOT NULL,
    level integer NOT NULL CHECK (level > 0),
    max_health integer NOT NULL CHECK (max_health > 0),
    attack integer NOT NULL CHECK (attack > 0),
    defense integer NOT NULL CHECK (defense >= 0),
    speed integer NOT NULL CHECK (speed > 0),
    crit_rate double precision NOT NULL CHECK (crit_rate BETWEEN 0 AND 1),
    crit_damage double precision NOT NULL CHECK (crit_damage >= 0),
    special_move_name_zh_cn text NOT NULL,
    special_move_name_en text NOT NULL,
    special_move_description_zh_cn text NOT NULL,
    special_move_description_en text NOT NULL,
    color_theme text NOT NULL CHECK (color_theme ~ '^#[0-9A-Fa-f]{6}$'),
    image_url text CHECK (image_url IS NULL OR image_url ~ '^https://'),
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE battles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    character_id uuid NOT NULL REFERENCES characters(id),
    encounter_id uuid NOT NULL REFERENCES encounters(id),
    seed text NOT NULL CHECK (length(seed) BETWEEN 16 AND 256),
    state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object'),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
    outcome text CHECK (outcome IN ('victory', 'defeat')),
    reward_experience bigint NOT NULL DEFAULT 0 CHECK (reward_experience >= 0),
    reward_credits bigint NOT NULL DEFAULT 0 CHECK (reward_credits >= 0),
    reward_energy integer NOT NULL DEFAULT 0 CHECK (reward_energy <= 0),
    version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    CHECK (
        (status = 'active' AND outcome IS NULL AND completed_at IS NULL)
        OR (status = 'completed' AND outcome IS NOT NULL AND completed_at IS NOT NULL)
        OR (status = 'cancelled' AND outcome IS NULL AND completed_at IS NOT NULL)
    )
);

CREATE INDEX battles_player_created_idx ON battles (player_id, created_at DESC);
CREATE INDEX battles_active_player_idx ON battles (player_id) WHERE status = 'active';

CREATE TABLE battle_actions (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    battle_id uuid NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
    sequence integer NOT NULL CHECK (sequence > 0),
    action_type text NOT NULL CHECK (action_type IN ('light_attack', 'heavy_attack', 'special_move', 'block', 'counter')),
    expected_version bigint NOT NULL CHECK (expected_version >= 1),
    resulting_version bigint NOT NULL CHECK (resulting_version = expected_version + 1),
    idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 128),
    result_snapshot jsonb NOT NULL CHECK (jsonb_typeof(result_snapshot) = 'object'),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (battle_id, sequence),
    UNIQUE (battle_id, idempotency_key)
);

CREATE TABLE idempotency_records (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    operation text NOT NULL CHECK (length(operation) BETWEEN 1 AND 100),
    idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 128),
    request_hash bytea NOT NULL CHECK (octet_length(request_hash) = 32),
    response_status integer NOT NULL CHECK (response_status BETWEEN 200 AND 599),
    response_body jsonb NOT NULL CHECK (jsonb_typeof(response_body) = 'object'),
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
    UNIQUE (player_id, operation, idempotency_key)
);

CREATE INDEX idempotency_records_expiry_idx ON idempotency_records (expires_at);

CREATE TABLE player_ledger (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    resource_type text NOT NULL CHECK (resource_type IN ('experience', 'credits', 'energy')),
    delta bigint NOT NULL CHECK (delta <> 0),
    reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 100),
    source_battle_id uuid REFERENCES battles(id) ON DELETE RESTRICT,
    idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 128),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (player_id, resource_type, idempotency_key),
    UNIQUE (source_battle_id, resource_type, reason)
);

CREATE INDEX player_ledger_player_created_idx ON player_ledger (player_id, created_at DESC);

CREATE TABLE admin_audit_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id text NOT NULL,
    action text NOT NULL,
    target_type text NOT NULL,
    target_id text NOT NULL,
    request_id text NOT NULL,
    before_state jsonb,
    after_state jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (before_state IS NULL OR jsonb_typeof(before_state) = 'object'),
    CHECK (after_state IS NULL OR jsonb_typeof(after_state) = 'object')
);

CREATE OR REPLACE FUNCTION reject_immutable_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION '% is immutable', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER battle_actions_immutable
BEFORE UPDATE OR DELETE ON battle_actions
FOR EACH ROW EXECUTE FUNCTION reject_immutable_mutation();

CREATE TRIGGER player_ledger_immutable
BEFORE UPDATE OR DELETE ON player_ledger
FOR EACH ROW EXECUTE FUNCTION reject_immutable_mutation();

CREATE TRIGGER admin_audit_events_immutable
BEFORE UPDATE OR DELETE ON admin_audit_events
FOR EACH ROW EXECUTE FUNCTION reject_immutable_mutation();
