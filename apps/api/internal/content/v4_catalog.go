package content

import (
	"errors"
	"fmt"
	"path"
	"slices"
	"strings"
)

const (
	V4Version  = "v4"
	V4Protocol = "shooter-v1"
)

type V4Manifest struct {
	ContentVersion string   `json:"content_version"`
	Protocol       string   `json:"protocol"`
	DefaultLocale  string   `json:"default_locale"`
	Locales        []string `json:"locales"`
	Assets         []string `json:"assets"`
	ChapterFiles   []string `json:"chapter_files"`
	DailyFile      string   `json:"daily_file"`
	Rules          V4Rules  `json:"rules"`
}

type V4Rules struct {
	TickRate             int `json:"tick_rate"`
	LogicalWidth         int `json:"logical_width"`
	LogicalHeight        int `json:"logical_height"`
	PlayerY              int `json:"player_y"`
	InputColumns         int `json:"input_columns"`
	StartingHearts       int `json:"starting_hearts"`
	MaxEnemies           int `json:"max_enemies"`
	MaxEnemyProjectiles  int `json:"max_enemy_projectiles"`
	MaxPlayerProjectiles int `json:"max_player_projectiles"`
	MaxPickups           int `json:"max_pickups"`
	MaxEffects           int `json:"max_effects"`
	SpecialChargeMax     int `json:"special_charge_max"`
	GrazeCharge          int `json:"graze_charge"`
	WavesPerChapter      int `json:"waves_per_chapter"`
	BossStages           int `json:"boss_stages"`
}

type V4SharedDocument struct {
	ShowEffects []V4ShowEffect `json:"show_effects"`
	Characters  []V4Character  `json:"characters"`
	Companions  []V4Companion  `json:"companions"`
	Enemies     []V4Enemy      `json:"enemies"`
}

type V4ChapterDocument struct {
	Chapter V4Chapter `json:"chapter"`
}

type V4LocaleDocument struct {
	Locale  string            `json:"locale"`
	Strings map[string]string `json:"strings"`
}

type V4ShowEffect struct {
	ID             string `json:"id"`
	NameKey        string `json:"name_key"`
	DescriptionKey string `json:"description_key"`
	Archetype      string `json:"archetype"`
	Behavior       string `json:"behavior"`
	Amount         int    `json:"amount"`
}

type V4PlayerStats struct {
	MaxHealth    int `json:"max_health"`
	ShotDamage   int `json:"shot_damage"`
	ShotInterval int `json:"shot_interval"`
	MoveLimit    int `json:"move_limit"`
}

type V4Special struct {
	ID             string `json:"id"`
	NameKey        string `json:"name_key"`
	DescriptionKey string `json:"description_key"`
	ChargeCost     int    `json:"charge_cost"`
	Behavior       string `json:"behavior"`
	Power          int    `json:"power"`
	DurationTicks  int    `json:"duration_ticks"`
}

type V4Character struct {
	ID           string        `json:"id"`
	NameKey      string        `json:"name_key"`
	BiographyKey string        `json:"biography_key"`
	PlaystyleKey string        `json:"playstyle_key"`
	ColorTheme   string        `json:"color_theme"`
	PortraitURL  string        `json:"portrait_url"`
	SpriteURL    string        `json:"sprite_url"`
	BaseStats    V4PlayerStats `json:"base_stats"`
	Special      V4Special     `json:"special"`
}

type V4Assist struct {
	Trigger       string `json:"trigger"`
	Behavior      string `json:"behavior"`
	Amount        int    `json:"amount"`
	CooldownTicks int    `json:"cooldown_ticks"`
}

type V4Companion struct {
	ID             string   `json:"id"`
	CharacterID    string   `json:"character_id"`
	NameKey        string   `json:"name_key"`
	DescriptionKey string   `json:"description_key"`
	PortraitURL    string   `json:"portrait_url"`
	Assist         V4Assist `json:"assist"`
}

type V4Enemy struct {
	ID               string   `json:"id"`
	NameKey          string   `json:"name_key"`
	DescriptionKey   string   `json:"description_key"`
	SpriteURL        string   `json:"sprite_url"`
	MaxHealth        int      `json:"max_health"`
	Speed            int      `json:"speed"`
	ContactDamage    int      `json:"contact_damage"`
	MovePattern      string   `json:"move_pattern"`
	ShotPattern      string   `json:"shot_pattern"`
	ShotInterval     int      `json:"shot_interval"`
	ProjectileSpeed  int      `json:"projectile_speed"`
	ProjectileDamage int      `json:"projectile_damage"`
	TelegraphTicks   int      `json:"telegraph_ticks"`
	Traits           []string `json:"traits"`
}

type V4Segment struct {
	ID            string `json:"id"`
	DurationTicks int    `json:"duration_ticks"`
	WaveID        string `json:"wave_id"`
	BackgroundURL string `json:"background_url"`
	RewardStage   string `json:"reward_stage"`
}

type V4Spawn struct {
	AtTick        int    `json:"at_tick"`
	EnemyID       string `json:"enemy_id"`
	Count         int    `json:"count"`
	Formation     string `json:"formation"`
	IntervalTicks int    `json:"interval_ticks"`
}

type V4Wave struct {
	ID     string    `json:"id"`
	Spawns []V4Spawn `json:"spawns"`
}

type V4BossStage struct {
	ID               string `json:"id"`
	HealthThreshold  int    `json:"health_threshold"`
	MovePattern      string `json:"move_pattern"`
	ShotPattern      string `json:"shot_pattern"`
	ShotInterval     int    `json:"shot_interval"`
	ProjectileSpeed  int    `json:"projectile_speed"`
	ProjectileDamage int    `json:"projectile_damage"`
	TelegraphTicks   int    `json:"telegraph_ticks"`
	Special          string `json:"special"`
}

type V4Boss struct {
	ID             string        `json:"id"`
	NameKey        string        `json:"name_key"`
	DescriptionKey string        `json:"description_key"`
	SpriteURL      string        `json:"sprite_url"`
	MaxHealth      int           `json:"max_health"`
	DurationTicks  int           `json:"duration_ticks"`
	Stages         []V4BossStage `json:"stages"`
}

type V4Bubble struct {
	Sender  string `json:"sender"`
	TextKey string `json:"text_key"`
}

type V4StoryChoice struct {
	ID           string `json:"id"`
	LabelKey     string `json:"label_key"`
	ResultKey    string `json:"result_key"`
	Tag          string `json:"tag"`
	ShowEffectID string `json:"show_effect_id"`
}

type V4Intermission struct {
	AfterSegment int             `json:"after_segment"`
	PromptKey    string          `json:"prompt_key"`
	Messages     []V4Bubble      `json:"messages"`
	Choices      []V4StoryChoice `json:"choices"`
}

type V4Story struct {
	Prelude      []V4Bubble     `json:"prelude"`
	Intermission V4Intermission `json:"intermission"`
	Epilogue     []V4Bubble     `json:"epilogue"`
	ReplayRecap  []V4Bubble     `json:"replay_recap"`
}

type V4EncoreModifier struct {
	ID                          string `json:"id"`
	NameKey                     string `json:"name_key"`
	DescriptionKey              string `json:"description_key"`
	EnemySpeedPercent           int    `json:"enemy_speed_percent"`
	ProjectileSpeedPercent      int    `json:"projectile_speed_percent"`
	SpecialChargePenaltyPercent int    `json:"special_charge_penalty_percent"`
}

type V4Ending struct {
	ID         string     `json:"id"`
	TitleKey   string     `json:"title_key"`
	SummaryKey string     `json:"summary_key"`
	Messages   []V4Bubble `json:"messages"`
}

type V4Chapter struct {
	ID                string             `json:"id"`
	Order             int                `json:"order"`
	TitleKey          string             `json:"title_key"`
	SubtitleKey       string             `json:"subtitle_key"`
	FeaturedCharacter string             `json:"featured_character"`
	UnlockCompanion   string             `json:"unlock_companion"`
	BackgroundURL     string             `json:"background_url"`
	Segments          []V4Segment        `json:"segments"`
	Waves             []V4Wave           `json:"waves"`
	Boss              V4Boss             `json:"boss"`
	Story             V4Story            `json:"story"`
	Encore            []V4EncoreModifier `json:"encore"`
	Endings           []V4Ending         `json:"endings"`
}

type V4Daily struct {
	ID                   string   `json:"id"`
	TitleKey             string   `json:"title_key"`
	SubtitleKey          string   `json:"subtitle_key"`
	SeedTimezone         string   `json:"seed_timezone"`
	SegmentDurationTicks int      `json:"segment_duration_ticks"`
	SegmentCount         int      `json:"segment_count"`
	ShowChoiceCount      int      `json:"show_choice_count"`
	RotationCharacters   []string `json:"rotation_characters"`
	WaveIDs              []string `json:"wave_ids"`
	BossIDs              []string `json:"boss_ids"`
	EncoreModifierIDs    []string `json:"encore_modifier_ids"`
}

type V4Bundle struct {
	ContentVersion string         `json:"content_version"`
	Protocol       string         `json:"protocol"`
	Rules          V4Rules        `json:"rules"`
	ShowEffects    []V4ShowEffect `json:"show_effects"`
	Characters     []V4Character  `json:"characters"`
	Companions     []V4Companion  `json:"companions"`
	Enemies        []V4Enemy      `json:"enemies"`
	Chapters       []V4Chapter    `json:"chapters"`
	Daily          V4Daily        `json:"daily"`
}

type V4Catalog struct {
	V4Bundle
	Manifest V4Manifest
	Locales  map[string]map[string]string

	assets      map[string]bool
	showEffects map[string]V4ShowEffect
	characters  map[string]V4Character
	companions  map[string]V4Companion
	enemies     map[string]V4Enemy
	chapters    map[string]V4Chapter
	waves       map[string]V4Wave
	bosses      map[string]V4Boss
	encore      map[string]V4EncoreModifier
}

func LoadV4() (*V4Catalog, error) {
	const prefix = V4Version + "/"
	var manifest V4Manifest
	if err := decodeFile(prefix+"manifest.json", &manifest); err != nil {
		return nil, err
	}
	var shared V4SharedDocument
	if err := decodeFile(prefix+"shared.json", &shared); err != nil {
		return nil, err
	}
	var daily V4Daily
	cleanDaily := path.Clean(manifest.DailyFile)
	if cleanDaily != manifest.DailyFile || !strings.HasSuffix(cleanDaily, ".json") {
		return nil, fmt.Errorf("content: invalid V4 daily file %q", manifest.DailyFile)
	}
	if err := decodeFile(prefix+cleanDaily, &daily); err != nil {
		return nil, err
	}
	bundle := V4Bundle{ContentVersion: manifest.ContentVersion, Protocol: manifest.Protocol, Rules: manifest.Rules, ShowEffects: shared.ShowEffects, Characters: shared.Characters, Companions: shared.Companions, Enemies: shared.Enemies, Daily: daily}
	for _, filename := range manifest.ChapterFiles {
		clean := path.Clean(filename)
		if clean != filename || !strings.HasPrefix(clean, "chapters/") || !strings.HasSuffix(clean, ".json") {
			return nil, fmt.Errorf("content: invalid V4 chapter file %q", filename)
		}
		var document V4ChapterDocument
		if err := decodeFile(prefix+clean, &document); err != nil {
			return nil, err
		}
		bundle.Chapters = append(bundle.Chapters, document.Chapter)
	}
	catalog := &V4Catalog{V4Bundle: bundle, Manifest: manifest, Locales: make(map[string]map[string]string)}
	for _, locale := range manifest.Locales {
		var document V4LocaleDocument
		if err := decodeFile(prefix+"locales/"+locale+".json", &document); err != nil {
			return nil, err
		}
		if document.Locale != locale {
			return nil, fmt.Errorf("content: V4 locale %q identifies as %q", locale, document.Locale)
		}
		catalog.Locales[locale] = document.Strings
	}
	if err := catalog.validate(); err != nil {
		return nil, err
	}
	return catalog, nil
}

func MustLoadV4() *V4Catalog {
	catalog, err := LoadV4()
	if err != nil {
		panic(err)
	}
	return catalog
}

func (catalog *V4Catalog) Text(locale, key string) string {
	values, ok := catalog.Locales[locale]
	if !ok {
		values = catalog.Locales[catalog.Manifest.DefaultLocale]
	}
	return values[key]
}

func (catalog *V4Catalog) ShowEffect(id string) (V4ShowEffect, bool) {
	item, ok := catalog.showEffects[id]
	return item, ok
}
func (catalog *V4Catalog) Character(id string) (V4Character, bool) {
	item, ok := catalog.characters[id]
	return item, ok
}
func (catalog *V4Catalog) Companion(id string) (V4Companion, bool) {
	item, ok := catalog.companions[id]
	return item, ok
}
func (catalog *V4Catalog) Enemy(id string) (V4Enemy, bool) {
	item, ok := catalog.enemies[id]
	return item, ok
}
func (catalog *V4Catalog) Chapter(id string) (V4Chapter, bool) {
	item, ok := catalog.chapters[id]
	return item, ok
}
func (catalog *V4Catalog) Boss(id string) (V4Boss, bool) {
	item, ok := catalog.bosses[id]
	return item, ok
}
func (catalog *V4Catalog) Encore(id string) (V4EncoreModifier, bool) {
	item, ok := catalog.encore[id]
	return item, ok
}
func (catalog *V4Catalog) Wave(id, chapterID string) (V4Wave, bool) {
	chapter, ok := catalog.chapters[chapterID]
	if !ok {
		return V4Wave{}, false
	}
	for _, wave := range chapter.Waves {
		if wave.ID == id {
			return wave, true
		}
	}
	return V4Wave{}, false
}

func (catalog *V4Catalog) validate() error {
	if catalog.ContentVersion != V4Version || catalog.Manifest.ContentVersion != V4Version || catalog.Protocol != V4Protocol || catalog.Manifest.Protocol != V4Protocol {
		return fmt.Errorf("content: expected %s/%s, got %s/%s", V4Version, V4Protocol, catalog.ContentVersion, catalog.Protocol)
	}
	if catalog.Manifest.DefaultLocale != "en" || !slices.Equal(catalog.Manifest.Locales, []string{"en", "zh-CN"}) {
		return errors.New("content: V4 locales must be en and zh-CN with English as default")
	}
	wantRules := V4Rules{TickRate: 30, LogicalWidth: 3600, LogicalHeight: 6400, PlayerY: 5200, InputColumns: 128, StartingHearts: 3, MaxEnemies: 14, MaxEnemyProjectiles: 120, MaxPlayerProjectiles: 48, MaxPickups: 12, MaxEffects: 24, SpecialChargeMax: 100, GrazeCharge: 4, WavesPerChapter: 3, BossStages: 3}
	if catalog.Rules != wantRules {
		return fmt.Errorf("content: V4 rules do not match shooter-v1: %#v", catalog.Rules)
	}
	if err := catalog.validateLocaleParity(); err != nil {
		return err
	}
	catalog.assets = make(map[string]bool, len(catalog.Manifest.Assets))
	for _, asset := range catalog.Manifest.Assets {
		if !validV4AssetPath(asset) || catalog.assets[asset] {
			return fmt.Errorf("content: invalid or duplicate V4 asset %q", asset)
		}
		catalog.assets[asset] = true
	}
	if len(catalog.assets) == 0 {
		return errors.New("content: V4 manifest has no assets")
	}
	for _, asset := range requiredV4Assets() {
		if !catalog.assets[asset] {
			return fmt.Errorf("content: V4 manifest is missing required asset %q", asset)
		}
	}
	if len(catalog.assets) != len(requiredV4Assets()) {
		return fmt.Errorf("content: V4 manifest has %d assets, want %d", len(catalog.assets), len(requiredV4Assets()))
	}
	if len(catalog.Manifest.ChapterFiles) != 8 || len(catalog.Chapters) != 8 {
		return fmt.Errorf("content: V4 needs eight chapters, got %d", len(catalog.Chapters))
	}
	if len(catalog.ShowEffects) != 12 || len(catalog.Characters) != 7 || len(catalog.Companions) != 7 || len(catalog.Enemies) != 6 {
		return fmt.Errorf("content: incomplete V4 shared content effects=%d characters=%d companions=%d enemies=%d", len(catalog.ShowEffects), len(catalog.Characters), len(catalog.Companions), len(catalog.Enemies))
	}
	if err := catalog.indexShared(); err != nil {
		return err
	}
	if err := catalog.indexChapters(); err != nil {
		return err
	}
	return catalog.validateDaily()
}

func (catalog *V4Catalog) validateLocaleParity() error {
	en, zh := catalog.Locales["en"], catalog.Locales["zh-CN"]
	if len(en) == 0 || len(en) != len(zh) {
		return errors.New("content: V4 locale key sets differ")
	}
	for key, value := range en {
		if strings.TrimSpace(key) == "" || strings.TrimSpace(value) == "" || strings.TrimSpace(zh[key]) == "" {
			return fmt.Errorf("content: V4 missing translation for %q", key)
		}
	}
	for key := range zh {
		if _, ok := en[key]; !ok {
			return fmt.Errorf("content: unexpected V4 zh-CN key %q", key)
		}
	}
	return nil
}

func (catalog *V4Catalog) keysExist(keys ...string) bool {
	for _, key := range keys {
		if strings.TrimSpace(catalog.Locales["en"][key]) == "" || strings.TrimSpace(catalog.Locales["zh-CN"][key]) == "" {
			return false
		}
	}
	return true
}

func (catalog *V4Catalog) indexShared() error {
	catalog.showEffects, catalog.characters = map[string]V4ShowEffect{}, map[string]V4Character{}
	catalog.companions, catalog.enemies = map[string]V4Companion{}, map[string]V4Enemy{}
	validArchetype := stringSet("power", "guard", "style")
	validEffectBehavior := stringSet("twin_shot", "piercing_shot", "spread_shot", "graze_charge", "guard_on_special", "pickup_magnet", "echo_volley", "boss_break", "low_health_power", "combo_extend", "companion_charge", "recovery_drop")
	requiredEffectID := stringSet("double-take", "clean-cut", "wide-angle", "close-call", "safety-chat", "sticky-comment", "instant-replay", "headline-break", "still-live", "no-dead-air", "cohost-cue", "snack-drop")
	seenEffectBehavior := map[string]bool{}
	for _, item := range catalog.ShowEffects {
		if !requiredEffectID[item.ID] || !validArchetype[item.Archetype] || !validEffectBehavior[item.Behavior] || seenEffectBehavior[item.Behavior] || item.Amount <= 0 || !catalog.keysExist(item.NameKey, item.DescriptionKey) || catalog.showEffects[item.ID].ID != "" {
			return fmt.Errorf("content: invalid V4 show effect %q", item.ID)
		}
		catalog.showEffects[item.ID] = item
		seenEffectBehavior[item.Behavior] = true
	}
	validSpecial := stringSet("barrage_break", "cheer_guard", "afterimage_replay", "captain_parry", "subtitle_flip", "prism_shift", "memory_bloom")
	requiredCharacterID := stringSet("nana7mi", "jiaran", "xiangwan", "bella", "lulu", "xingtong", "nailu")
	seenSpecial := map[string]bool{}
	for _, item := range catalog.Characters {
		stats, special := item.BaseStats, item.Special
		if !requiredCharacterID[item.ID] || item.ColorTheme == "" || !catalog.assets[item.PortraitURL] || !catalog.assets[item.SpriteURL] || stats.MaxHealth != catalog.Rules.StartingHearts || stats.ShotDamage <= 0 || stats.ShotInterval <= 0 || stats.MoveLimit <= 0 || special.ID == "" || !validSpecial[special.Behavior] || seenSpecial[special.Behavior] || special.ChargeCost != catalog.Rules.SpecialChargeMax || special.Power <= 0 || special.DurationTicks <= 0 || !catalog.keysExist(item.NameKey, item.BiographyKey, item.PlaystyleKey, special.NameKey, special.DescriptionKey) || catalog.characters[item.ID].ID != "" {
			return fmt.Errorf("content: invalid V4 character %q", item.ID)
		}
		catalog.characters[item.ID] = item
		seenSpecial[special.Behavior] = true
	}
	validAssistTrigger := stringSet("segment_start", "graze_streak", "low_health", "special_used", "boss_stage", "pickup_chain", "wave_clear")
	validAssistBehavior := stringSet("side_shot", "shield", "echo_shot", "clear_lane", "convert_bullet", "focus_beam", "heal")
	for _, item := range catalog.Companions {
		if item.ID != item.CharacterID+"-assist" || catalog.characters[item.CharacterID].ID == "" || !catalog.assets[item.PortraitURL] || !validAssistTrigger[item.Assist.Trigger] || !validAssistBehavior[item.Assist.Behavior] || item.Assist.Amount <= 0 || item.Assist.CooldownTicks <= 0 || !catalog.keysExist(item.NameKey, item.DescriptionKey) || catalog.companions[item.ID].ID != "" {
			return fmt.Errorf("content: invalid V4 companion %q", item.ID)
		}
		catalog.companions[item.ID] = item
	}
	validMove := stringSet("drift", "sweep", "dive", "orbit", "anchor", "mirror")
	validShot := stringSet("aimed", "fan", "lane", "ring", "delayed", "beam")
	validTrait := stringSet("shield_link", "split", "steal_pickup", "armor", "echo", "jammer")
	requiredEnemyID := stringSet("spam-bot", "clip-cutter", "caption-blob", "black-screen-ghost", "gift-thief", "censor-frame")
	for _, item := range catalog.Enemies {
		if !requiredEnemyID[item.ID] || !catalog.assets[item.SpriteURL] || item.MaxHealth <= 0 || item.Speed < 0 || item.ContactDamage < 0 || !validMove[item.MovePattern] || !validShot[item.ShotPattern] || item.ShotInterval < 20 || item.ProjectileSpeed <= 0 || item.ProjectileDamage <= 0 || item.TelegraphTicks < 6 || !catalog.keysExist(item.NameKey, item.DescriptionKey) || catalog.enemies[item.ID].ID != "" {
			return fmt.Errorf("content: invalid V4 enemy %q", item.ID)
		}
		for _, trait := range item.Traits {
			if !validTrait[trait] {
				return fmt.Errorf("content: V4 enemy %q has invalid trait %q", item.ID, trait)
			}
		}
		catalog.enemies[item.ID] = item
	}
	return nil
}

func (catalog *V4Catalog) indexChapters() error {
	catalog.chapters, catalog.waves, catalog.bosses, catalog.encore = map[string]V4Chapter{}, map[string]V4Wave{}, map[string]V4Boss{}, map[string]V4EncoreModifier{}
	orders, featured := map[int]bool{}, map[string]bool{}
	allChoices := map[string]bool{}
	for _, chapter := range catalog.Chapters {
		for _, choice := range chapter.Story.Intermission.Choices {
			if choice.ID == "" || allChoices[choice.ID] {
				return fmt.Errorf("content: duplicate V4 story choice %q", choice.ID)
			}
			allChoices[choice.ID] = true
		}
	}
	rewardStages := []string{"weapon", "companion", "rescue"}
	validFormation := stringSet("line", "fan", "staggered", "pincer", "center", "sweep")
	validMove := stringSet("drift", "sweep", "dive", "orbit", "anchor", "mirror")
	validShot := stringSet("aimed", "fan", "lane", "ring", "delayed", "beam")
	expectedChapterIDs := []string{"seventh-dock", "always-cheerful", "loss-hidden", "captains-do-not-rest", "localization-failed", "which-is-original", "laplace-florist", "zero-channel"}
	expectedBossIDs := []string{"optimal-nana", "always-on-idol", "perfect-highlight", "perfect-captain", "approved-translation", "physical-original", "reality-auditor", "auto-archive-system"}
	expectedCharacters := []string{"nana7mi", "jiaran", "xiangwan", "bella", "lulu", "xingtong", "nailu"}
	for _, chapter := range catalog.Chapters {
		if chapter.ID == "" || chapter.Order < 1 || chapter.Order > 8 || chapter.ID != expectedChapterIDs[chapter.Order-1] || chapter.Boss.ID != expectedBossIDs[chapter.Order-1] || orders[chapter.Order] || catalog.chapters[chapter.ID].ID != "" || !catalog.assets[chapter.BackgroundURL] || !catalog.keysExist(chapter.TitleKey, chapter.SubtitleKey) || len(chapter.Segments) != catalog.Rules.WavesPerChapter || len(chapter.Waves) != catalog.Rules.WavesPerChapter || len(chapter.Boss.Stages) != catalog.Rules.BossStages || len(chapter.Encore) == 0 {
			return fmt.Errorf("content: invalid V4 chapter %q", chapter.ID)
		}
		orders[chapter.Order] = true
		if chapter.Order < 8 {
			if chapter.FeaturedCharacter != expectedCharacters[chapter.Order-1] || catalog.characters[chapter.FeaturedCharacter].ID == "" || catalog.companions[chapter.UnlockCompanion].CharacterID != chapter.FeaturedCharacter || featured[chapter.FeaturedCharacter] {
				return fmt.Errorf("content: V4 chapter %q has invalid featured character or companion", chapter.ID)
			}
			featured[chapter.FeaturedCharacter] = true
			if len(chapter.Endings) != 0 {
				return fmt.Errorf("content: non-finale V4 chapter %q has endings", chapter.ID)
			}
		} else if chapter.FeaturedCharacter != "player-choice" || chapter.UnlockCompanion != "" || !catalog.validFinaleEndings(chapter.Endings) {
			return fmt.Errorf("content: V4 finale %q is incomplete", chapter.ID)
		}
		chapterWaveIDs := map[string]bool{}
		for _, wave := range chapter.Waves {
			if wave.ID == "" || len(wave.Spawns) == 0 || chapterWaveIDs[wave.ID] || catalog.waves[wave.ID].ID != "" {
				return fmt.Errorf("content: invalid V4 wave %q", wave.ID)
			}
			chapterWaveIDs[wave.ID] = true
			spawnedEnemies := 0
			for _, spawn := range wave.Spawns {
				if spawn.AtTick < 0 || catalog.enemies[spawn.EnemyID].ID == "" || spawn.Count < 1 || spawn.Count > 8 || !validFormation[spawn.Formation] || spawn.IntervalTicks < 0 {
					return fmt.Errorf("content: V4 wave %q has invalid spawn", wave.ID)
				}
				spawnedEnemies += spawn.Count
			}
			if spawnedEnemies > catalog.Rules.MaxEnemies {
				return fmt.Errorf("content: V4 wave %q can spawn %d enemies, cap is %d", wave.ID, spawnedEnemies, catalog.Rules.MaxEnemies)
			}
			catalog.waves[wave.ID] = wave
		}
		segmentIDs, referencedWaves := map[string]bool{}, map[string]bool{}
		for index, segment := range chapter.Segments {
			minimumTicks := 1050
			if chapter.Order == 1 && index == 0 {
				minimumTicks = 900
			}
			if segment.ID == "" || segmentIDs[segment.ID] || segment.DurationTicks < minimumTicks || segment.DurationTicks > 1350 || !chapterWaveIDs[segment.WaveID] || referencedWaves[segment.WaveID] || !catalog.assets[segment.BackgroundURL] || segment.RewardStage != rewardStages[index] {
				return fmt.Errorf("content: V4 chapter %q has invalid segment %q", chapter.ID, segment.ID)
			}
			segmentIDs[segment.ID] = true
			referencedWaves[segment.WaveID] = true
			wave := catalog.waves[segment.WaveID]
			for _, spawn := range wave.Spawns {
				lastSpawnTick := spawn.AtTick + (spawn.Count-1)*spawn.IntervalTicks
				if lastSpawnTick >= segment.DurationTicks {
					return fmt.Errorf("content: V4 wave %q schedules an enemy after segment %q ends", wave.ID, segment.ID)
				}
			}
		}
		if len(referencedWaves) != len(chapter.Waves) {
			return fmt.Errorf("content: V4 chapter %q has an unused wave", chapter.ID)
		}
		boss := chapter.Boss
		if boss.ID == "" || catalog.bosses[boss.ID].ID != "" || !catalog.assets[boss.SpriteURL] || boss.MaxHealth <= 0 || boss.DurationTicks != 1800 || !catalog.keysExist(boss.NameKey, boss.DescriptionKey) {
			return fmt.Errorf("content: V4 chapter %q has invalid boss", chapter.ID)
		}
		thresholds := []int{100, 66, 33}
		for index, stage := range boss.Stages {
			if stage.ID == "" || stage.HealthThreshold != thresholds[index] || !validMove[stage.MovePattern] || !validShot[stage.ShotPattern] || stage.ShotInterval < 20 || stage.ProjectileSpeed <= 0 || stage.ProjectileDamage <= 0 || stage.TelegraphTicks < 6 || stage.Special == "" {
				return fmt.Errorf("content: V4 boss %q has invalid stage %d", boss.ID, index+1)
			}
		}
		catalog.bosses[boss.ID] = boss
		if err := catalog.validateStory(chapter); err != nil {
			return err
		}
		for _, modifier := range chapter.Encore {
			if modifier.ID == "" || catalog.encore[modifier.ID].ID != "" || modifier.EnemySpeedPercent < 0 || modifier.ProjectileSpeedPercent < 0 || modifier.SpecialChargePenaltyPercent < 0 || modifier.SpecialChargePenaltyPercent > 75 || !catalog.keysExist(modifier.NameKey, modifier.DescriptionKey) {
				return fmt.Errorf("content: invalid V4 encore modifier %q", modifier.ID)
			}
			catalog.encore[modifier.ID] = modifier
		}
		catalog.chapters[chapter.ID] = chapter
	}
	return nil
}

func (catalog *V4Catalog) validateStory(chapter V4Chapter) error {
	story := chapter.Story
	if err := catalog.validateBubbles(chapter.ID, "prelude", story.Prelude); err != nil {
		return err
	}
	if err := catalog.validateBubbles(chapter.ID, "intermission", story.Intermission.Messages); err != nil {
		return err
	}
	if err := catalog.validateBubbles(chapter.ID, "epilogue", story.Epilogue); err != nil {
		return err
	}
	if err := catalog.validateBubbles(chapter.ID, "replay recap", story.ReplayRecap); err != nil {
		return err
	}
	if len(story.ReplayRecap) != 1 {
		return fmt.Errorf("content: V4 chapter %q replay recap must be one bubble", chapter.ID)
	}
	if story.Intermission.AfterSegment != 2 || len(story.Intermission.Choices) != 2 || !catalog.keysExist(story.Intermission.PromptKey) {
		return fmt.Errorf("content: V4 chapter %q needs one concrete two-choice intermission after segment 2", chapter.ID)
	}
	seen := map[string]bool{}
	for _, choice := range story.Intermission.Choices {
		if choice.ID == "" || choice.Tag == "" || seen[choice.ID] || (choice.ShowEffectID != "" && catalog.showEffects[choice.ShowEffectID].ID == "") || !catalog.keysExist(choice.LabelKey, choice.ResultKey) {
			return fmt.Errorf("content: V4 chapter %q has invalid intermission choice %q", chapter.ID, choice.ID)
		}
		seen[choice.ID] = true
	}
	return nil
}

func (catalog *V4Catalog) validateBubbles(chapter, kind string, bubbles []V4Bubble) error {
	if len(bubbles) == 0 || len(bubbles) > 3 {
		return fmt.Errorf("content: V4 chapter %q %s must contain one to three bubbles", chapter, kind)
	}
	validSender := stringSet("nana7mi", "jiaran", "xiangwan", "bella", "lulu", "xingtong", "nailu", "system", "group")
	for _, bubble := range bubbles {
		if !validSender[bubble.Sender] || !catalog.keysExist("sender."+bubble.Sender, bubble.TextKey) {
			return fmt.Errorf("content: V4 chapter %q has invalid %s bubble", chapter, kind)
		}
	}
	return nil
}

func (catalog *V4Catalog) validFinaleEndings(endings []V4Ending) bool {
	if len(endings) != 3 {
		return false
	}
	want := map[string]bool{"open-archive": true, "shared-cut": true, "quiet-signoff": true}
	for _, ending := range endings {
		if !want[ending.ID] || !catalog.keysExist(ending.TitleKey, ending.SummaryKey) || catalog.validateBubbles("zero-channel", "ending "+ending.ID, ending.Messages) != nil {
			return false
		}
		delete(want, ending.ID)
	}
	return len(want) == 0
}

func (catalog *V4Catalog) validateDaily() error {
	daily := catalog.Daily
	if daily.ID != "daily-aftershow" || daily.SeedTimezone != "UTC" || daily.SegmentCount != 2 || daily.ShowChoiceCount != 1 || daily.SegmentDurationTicks < 450 || daily.SegmentDurationTicks > 1800 || len(daily.RotationCharacters) != 7 || len(daily.WaveIDs) < 8 || len(daily.BossIDs) != 8 || len(daily.EncoreModifierIDs) < 8 || !catalog.keysExist(daily.TitleKey, daily.SubtitleKey) {
		return errors.New("content: Daily Aftershow is incomplete")
	}
	for _, id := range daily.RotationCharacters {
		if catalog.characters[id].ID == "" {
			return fmt.Errorf("content: daily references character %q", id)
		}
	}
	for _, id := range daily.WaveIDs {
		if catalog.waves[id].ID == "" {
			return fmt.Errorf("content: daily references wave %q", id)
		}
	}
	for _, id := range daily.BossIDs {
		if catalog.bosses[id].ID == "" {
			return fmt.Errorf("content: daily references boss %q", id)
		}
	}
	for _, id := range daily.EncoreModifierIDs {
		if catalog.encore[id].ID == "" {
			return fmt.Errorf("content: daily references encore modifier %q", id)
		}
	}
	return nil
}

func validV4AssetPath(asset string) bool {
	if path.Clean(asset) != asset || !strings.HasPrefix(asset, "/game/v4/") || !strings.HasSuffix(asset, ".webp") {
		return false
	}
	parts := strings.Split(asset, "/")
	if len(parts) != 5 || !stringSet("backgrounds", "bosses", "enemies", "pickups", "players")[parts[3]] {
		return false
	}
	slug := strings.TrimSuffix(parts[4], ".webp")
	if slug == "" {
		return false
	}
	for _, character := range slug {
		if (character < 'a' || character > 'z') && (character < '0' || character > '9') && character != '-' {
			return false
		}
	}
	return true
}

func requiredV4Assets() []string {
	return []string{
		"/game/v4/backgrounds/seventh-dock.webp",
		"/game/v4/backgrounds/always-cheerful.webp",
		"/game/v4/backgrounds/loss-hidden.webp",
		"/game/v4/backgrounds/captains-do-not-rest.webp",
		"/game/v4/backgrounds/localization-failed.webp",
		"/game/v4/backgrounds/which-is-original.webp",
		"/game/v4/backgrounds/laplace-florist.webp",
		"/game/v4/backgrounds/zero-channel.webp",
		"/game/v4/players/nana7mi.webp",
		"/game/v4/players/jiaran.webp",
		"/game/v4/players/xiangwan.webp",
		"/game/v4/players/bella.webp",
		"/game/v4/players/lulu.webp",
		"/game/v4/players/xingtong.webp",
		"/game/v4/players/nailu.webp",
		"/game/v4/enemies/spam-bot.webp",
		"/game/v4/enemies/clip-cutter.webp",
		"/game/v4/enemies/caption-blob.webp",
		"/game/v4/enemies/black-screen-ghost.webp",
		"/game/v4/enemies/gift-thief.webp",
		"/game/v4/enemies/censor-frame.webp",
		"/game/v4/bosses/optimal-nana.webp",
		"/game/v4/bosses/always-on-idol.webp",
		"/game/v4/bosses/perfect-highlight.webp",
		"/game/v4/bosses/perfect-captain.webp",
		"/game/v4/bosses/approved-translation.webp",
		"/game/v4/bosses/physical-original.webp",
		"/game/v4/bosses/reality-auditor.webp",
		"/game/v4/bosses/auto-archive-system.webp",
		"/game/v4/pickups/support-cyan.webp",
		"/game/v4/pickups/support-pink.webp",
		"/game/v4/pickups/support-gold.webp",
	}
}
