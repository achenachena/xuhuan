-- Shooter V4 production validation is complete. Remove Action V3 rollback
-- fields and keep only the commands and horizontal unlocks used by Live Rescue.
-- The old Lambda remains callable for a few seconds between migrations 007 and
-- the alias switch. Remove only compatibility-window rows that V4 cannot have,
-- so a late V3 request cannot make the final constraints fail.
DELETE FROM runs WHERE content_version <> 'v4';
UPDATE player_campaign_progress
SET ending = NULL
WHERE ending IN ('authentic', 'balanced', 'retained');

-- Chapter progress and horizontal unlock rows do not carry a content version,
-- so an old Lambda could write values that look valid after 007. Rebuild both
-- projections exclusively from retained, cleared V4 campaign runs. Active V4
-- runs and V4 daily results stay untouched; Action V3 writes cannot survive by
-- reusing a current character or chapter slug.
DELETE FROM player_chapter_progress;
DELETE FROM player_unlocks;

INSERT INTO player_chapter_progress(player_id, chapter_slug)
SELECT id, 'seventh-dock' FROM players;

WITH cleared_v4 AS (
    SELECT player_id, chapter_slug,
        count(*)::integer AS clears,
        LEAST(3, max(encore_level) + 1) AS highest_encore_level,
        max(COALESCE((state->>'score')::integer, 0)) AS best_score
    FROM runs
    WHERE content_version = 'v4'
      AND run_mode = 'campaign'
      AND status = 'completed'
      AND outcome = 'cleared'
    GROUP BY player_id, chapter_slug
)
INSERT INTO player_chapter_progress(
    player_id, chapter_slug, highest_encore_level, clears, best_score
)
SELECT player_id, chapter_slug, highest_encore_level, clears, best_score
FROM cleared_v4
ON CONFLICT(player_id, chapter_slug) DO UPDATE SET
    highest_encore_level = EXCLUDED.highest_encore_level,
    clears = EXCLUDED.clears,
    best_score = EXCLUDED.best_score,
    updated_at = now();

WITH chapter_transition(chapter_slug, next_chapter_slug) AS (VALUES
    ('seventh-dock', 'always-cheerful'),
    ('always-cheerful', 'loss-hidden'),
    ('loss-hidden', 'captains-do-not-rest'),
    ('captains-do-not-rest', 'localization-failed'),
    ('localization-failed', 'which-is-original'),
    ('which-is-original', 'laplace-florist'),
    ('laplace-florist', 'zero-channel')
)
INSERT INTO player_chapter_progress(player_id, chapter_slug)
SELECT DISTINCT run.player_id, transition.next_chapter_slug
FROM runs AS run
JOIN chapter_transition AS transition USING (chapter_slug)
WHERE run.content_version = 'v4'
  AND run.run_mode = 'campaign'
  AND run.status = 'completed'
  AND run.outcome = 'cleared'
ON CONFLICT DO NOTHING;

INSERT INTO player_unlocks(player_id, unlock_type, content_slug)
SELECT id, 'character', 'nana7mi' FROM players;

WITH chapter_unlock(chapter_slug, companion_slug, next_character_slug) AS (VALUES
    ('seventh-dock', 'nana7mi-assist', 'jiaran'),
    ('always-cheerful', 'jiaran-assist', 'xiangwan'),
    ('loss-hidden', 'xiangwan-assist', 'bella'),
    ('captains-do-not-rest', 'bella-assist', 'lulu'),
    ('localization-failed', 'lulu-assist', 'xingtong'),
    ('which-is-original', 'xingtong-assist', 'nailu'),
    ('laplace-florist', 'nailu-assist', NULL)
), cleared_v4 AS (
    SELECT DISTINCT player_id, chapter_slug
    FROM runs
    WHERE content_version = 'v4'
      AND run_mode = 'campaign'
      AND status = 'completed'
      AND outcome = 'cleared'
)
INSERT INTO player_unlocks(player_id, unlock_type, content_slug)
SELECT cleared.player_id, unlock.unlock_type, unlock.content_slug
FROM cleared_v4 AS cleared
JOIN chapter_unlock AS chapter USING (chapter_slug)
CROSS JOIN LATERAL (VALUES
    ('companion', chapter.companion_slug),
    ('character', chapter.next_character_slug),
    ('memory_clip', cleared.chapter_slug || '-memory')
) AS unlock(unlock_type, content_slug)
WHERE unlock.content_slug IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO player_unlocks(player_id, unlock_type, content_slug)
SELECT DISTINCT player_id, 'memory_clip', 'zero-channel-memory'
FROM runs
WHERE content_version = 'v4'
  AND run_mode = 'campaign'
  AND chapter_slug = 'zero-channel'
  AND status = 'completed'
  AND outcome = 'cleared'
ON CONFLICT DO NOTHING;

UPDATE player_campaign_progress AS progress
SET current_chapter_slug = CASE
    WHEN EXISTS (SELECT 1 FROM player_chapter_progress chapter WHERE chapter.player_id=progress.player_id AND chapter.chapter_slug='zero-channel' AND chapter.clears>0) THEN 'zero-channel'
    WHEN EXISTS (SELECT 1 FROM player_chapter_progress chapter WHERE chapter.player_id=progress.player_id AND chapter.chapter_slug='laplace-florist' AND chapter.clears>0) THEN 'zero-channel'
    WHEN EXISTS (SELECT 1 FROM player_chapter_progress chapter WHERE chapter.player_id=progress.player_id AND chapter.chapter_slug='which-is-original' AND chapter.clears>0) THEN 'laplace-florist'
    WHEN EXISTS (SELECT 1 FROM player_chapter_progress chapter WHERE chapter.player_id=progress.player_id AND chapter.chapter_slug='localization-failed' AND chapter.clears>0) THEN 'which-is-original'
    WHEN EXISTS (SELECT 1 FROM player_chapter_progress chapter WHERE chapter.player_id=progress.player_id AND chapter.chapter_slug='captains-do-not-rest' AND chapter.clears>0) THEN 'localization-failed'
    WHEN EXISTS (SELECT 1 FROM player_chapter_progress chapter WHERE chapter.player_id=progress.player_id AND chapter.chapter_slug='loss-hidden' AND chapter.clears>0) THEN 'captains-do-not-rest'
    WHEN EXISTS (SELECT 1 FROM player_chapter_progress chapter WHERE chapter.player_id=progress.player_id AND chapter.chapter_slug='always-cheerful' AND chapter.clears>0) THEN 'loss-hidden'
    WHEN EXISTS (SELECT 1 FROM player_chapter_progress chapter WHERE chapter.player_id=progress.player_id AND chapter.chapter_slug='seventh-dock' AND chapter.clears>0) THEN 'always-cheerful'
    ELSE 'seventh-dock'
END;

-- The previous Lambda can append an Action V3 story choice after 007 commits
-- but before the V4 alias is selected. Keep only exact V4 scene/option/tag
-- tuples. Temporarily removing the immutable trigger is limited to this
-- migration transaction; ordinary application writes remain append-only.
DROP TRIGGER story_choices_immutable ON story_choices;
WITH valid_choice(scene_slug, option_slug, choice_tag) AS (VALUES
    ('seventh-dock-intermission', 'keep-seven-second-voice', 'kept-withdrawn-voice'),
    ('seventh-dock-intermission', 'delete-learned-reply', 'deleted-learned-reply'),
    ('always-cheerful-intermission', 'stop-autonomous-encore', 'stopped-false-encore'),
    ('always-cheerful-intermission', 'join-encore-with-consent', 'joined-with-consent'),
    ('loss-hidden-intermission', 'restore-funniest-loss', 'restored-funniest-loss'),
    ('loss-hidden-intermission', 'mark-missing-loss', 'marked-missing-loss'),
    ('captains-do-not-rest-intermission', 'cancel-three-overnights', 'cancelled-overnights'),
    ('captains-do-not-rest-intermission', 'share-one-overnight', 'shared-overnight'),
    ('localization-failed-intermission', 'publish-original-snark', 'kept-original-snark'),
    ('localization-failed-intermission', 'post-caption-correction', 'posted-caption-correction'),
    ('which-is-original-intermission', 'keep-both-rooms', 'kept-both-rooms'),
    ('which-is-original-intermission', 'read-session-log', 'read-session-log'),
    ('laplace-florist-intermission', 'hold-future-photo', 'held-future-photo'),
    ('laplace-florist-intermission', 'recreate-photo-later', 'recreated-photo-later'),
    ('zero-channel-intermission', 'publish-mismatch-log', 'published-mismatch-log'),
    ('zero-channel-intermission', 'publish-seven-approved-notes', 'published-approved-accounts'),
    ('zero-channel-ending', 'open-archive', 'open-archive'),
    ('zero-channel-ending', 'shared-cut', 'shared-cut'),
    ('zero-channel-ending', 'quiet-signoff', 'quiet-signoff')
)
DELETE FROM story_choices AS choice
WHERE NOT EXISTS (
    SELECT 1 FROM valid_choice
    WHERE valid_choice.scene_slug = choice.scene_slug
      AND valid_choice.option_slug = choice.option_slug
      AND valid_choice.choice_tag = choice.choice_tag
);
CREATE TRIGGER story_choices_immutable BEFORE UPDATE OR DELETE ON story_choices
FOR EACH ROW EXECUTE FUNCTION reject_immutable_mutation();

-- Rebuild the materialized projection from the latest retained V4 revision.
-- This removes any V3 choice flags written during the compatibility window
-- while preserving chapter-clear facts rebuilt from retained V4 runs above.
WITH latest_choice AS (
    SELECT DISTINCT ON (player_id, scene_slug)
        player_id, scene_slug, option_slug, choice_tag
    FROM story_choices
    ORDER BY player_id, scene_slug, revision DESC, id DESC
), projected_flag AS (
    SELECT player_id, choice_tag AS flag FROM latest_choice
    UNION ALL
    SELECT player_id, scene_slug || '-resolved' FROM latest_choice
    UNION ALL
    SELECT player_id, 'chapter:' || chapter_slug || ':cleared'
    FROM player_chapter_progress WHERE clears > 0
    UNION ALL
    SELECT player_id, 'finale-cleared'
    FROM player_chapter_progress
    WHERE chapter_slug = 'zero-channel' AND clears > 0
), projected_story AS (
    SELECT player_id, jsonb_object_agg(flag, true) AS flags
    FROM projected_flag
    GROUP BY player_id
), latest_ending AS (
    SELECT player_id, option_slug
    FROM latest_choice
    WHERE scene_slug = 'zero-channel-ending'
      AND option_slug IN ('open-archive', 'shared-cut', 'quiet-signoff')
)
UPDATE player_campaign_progress AS progress
SET story_flags = COALESCE(
        (SELECT flags FROM projected_story WHERE projected_story.player_id = progress.player_id),
        '{}'::jsonb
    ),
    ending = (SELECT option_slug FROM latest_ending WHERE latest_ending.player_id = progress.player_id),
    daily_unlocked = EXISTS (
        SELECT 1 FROM latest_ending WHERE latest_ending.player_id = progress.player_id
    ),
    story_version = 4;

ALTER TABLE run_commands DROP CONSTRAINT run_commands_command_type_check;
ALTER TABLE run_commands ADD CONSTRAINT run_commands_command_type_check CHECK (command_type IN (
    'complete_segment', 'choose_show_option', 'choose_intermission_reply', 'abandon_run'
));

ALTER TABLE player_unlocks DROP CONSTRAINT player_unlocks_unlock_type_check;
ALTER TABLE player_unlocks ADD CONSTRAINT player_unlocks_unlock_type_check CHECK (unlock_type IN (
    'character', 'companion', 'memory_clip'
));

ALTER TABLE runs
    ALTER COLUMN start_request_payload SET NOT NULL,
    DROP COLUMN start_request_hash,
    DROP COLUMN noise_level;
ALTER TABLE run_commands DROP COLUMN request_hash;
ALTER TABLE player_chapter_progress DROP COLUMN highest_noise_level;

ALTER TABLE player_campaign_progress
    DROP COLUMN trust,
    DROP COLUMN authenticity,
    DROP COLUMN retention;

ALTER TABLE player_campaign_progress DROP CONSTRAINT player_campaign_progress_ending_check;
ALTER TABLE player_campaign_progress ADD CONSTRAINT player_campaign_progress_ending_check CHECK (
    ending IN ('open-archive', 'shared-cut', 'quiet-signoff')
);

ALTER TABLE story_choices
    DROP COLUMN request_hash,
    DROP COLUMN trust,
    DROP COLUMN authenticity,
    DROP COLUMN retention;
