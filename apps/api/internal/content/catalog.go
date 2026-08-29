package content

import (
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"path"
	"slices"
	"strings"
)

const (
	CurrentVersion  = "v3"
	CurrentProtocol = "action-v2"
)

// Files contains immutable content. Runs keep the exact version they start
// with so authored rules cannot change underneath an authoritative replay.
//
//go:embed v3/*.json v3/chapters/*.json v3/locales/*.json
var Files embed.FS

type Manifest struct {
	Version       string       `json:"version"`
	Protocol      string       `json:"protocol"`
	DefaultLocale string       `json:"default_locale"`
	Locales       []string     `json:"locales"`
	Assets        []string     `json:"assets"`
	ChapterFiles  []string     `json:"chapter_files"`
	Limits        EntityLimits `json:"limits"`
}

type EntityLimits struct {
	MaxEnemies           int `json:"max_enemies"`
	MaxEnemyProjectiles  int `json:"max_enemy_projectiles"`
	MaxPlayerProjectiles int `json:"max_player_projectiles"`
	MaxPickups           int `json:"max_pickups"`
	MaxEffects           int `json:"max_effects"`
}

type LocaleDocument struct {
	Locale  string            `json:"locale"`
	Strings map[string]string `json:"strings"`
}

type SharedDocument struct {
	Characters []Character `json:"characters"`
	Kits       []Kit       `json:"kits"`
	Modules    []Module    `json:"modules"`
	Plugins    []Plugin    `json:"plugins"`
	Enemies    []Enemy     `json:"enemies"`
}

type ChapterDocument struct {
	Chapter    Chapter      `json:"chapter"`
	Enemies    []Enemy      `json:"enemies"`
	Encounters []Encounter  `json:"encounters"`
	Events     []Event      `json:"events"`
	Scenes     []StoryScene `json:"scenes"`
}

type Character struct {
	Slug         string `json:"slug"`
	NameKey      string `json:"name_key"`
	BiographyKey string `json:"biography_key"`
	PlaystyleKey string `json:"playstyle_key"`
	ColorTheme   string `json:"color_theme"`
	PortraitURL  string `json:"portrait_url"`
	ModelURL     string `json:"model_url"`
	KitSlug      string `json:"kit_slug"`
}

type BaseStats struct {
	MaxHealth      int `json:"max_health"`
	AttackDamage   int `json:"attack_damage"`
	AttackInterval int `json:"attack_interval"`
	MoveSpeed      int `json:"move_speed"`
	WarpCooldown   int `json:"warp_cooldown"`
	WarpDamage     int `json:"warp_damage"`
}

type Kit struct {
	Slug          string    `json:"slug"`
	CharacterSlug string    `json:"character_slug"`
	Passive       string    `json:"passive"`
	Resonance     string    `json:"resonance"`
	BaseStats     BaseStats `json:"base_stats"`
}

type Effect struct {
	Kind   string `json:"kind"`
	Amount int    `json:"amount,omitempty"`
	Value  string `json:"value,omitempty"`
}

type ModuleLevelDefinition struct {
	Effects   []Effect   `json:"effects"`
	Behaviors []Behavior `json:"behaviors,omitempty"`
}

// Behavior is a cumulative, level-authored gameplay primitive. Unlike scalar
// Effects, behaviors retain their source and level in the resolved runtime so
// both deterministic engines can execute the same triggered rule.
type Behavior struct {
	Kind   string `json:"kind"`
	Amount int    `json:"amount"`
	Every  int    `json:"every,omitempty"`
}

type Module struct {
	Slug           string                  `json:"slug"`
	CharacterSlug  string                  `json:"character_slug,omitempty"`
	NameKey        string                  `json:"name_key"`
	DescriptionKey string                  `json:"description_key"`
	Archetype      string                  `json:"archetype"`
	Rarity         string                  `json:"rarity"`
	Levels         []ModuleLevelDefinition `json:"levels"`
}

type Plugin struct {
	Slug           string   `json:"slug"`
	CharacterSlug  string   `json:"character_slug,omitempty"`
	NameKey        string   `json:"name_key"`
	DescriptionKey string   `json:"description_key"`
	Effects        []Effect `json:"effects"`
}

type Movement struct {
	Kind   string `json:"kind"`
	Amount int    `json:"amount,omitempty"`
}

type Attack struct {
	Kind            string `json:"kind"`
	Interval        int    `json:"interval"`
	ProjectileSpeed int    `json:"projectile_speed"`
	Damage          int    `json:"damage"`
	Count           int    `json:"count,omitempty"`
	Spread          int    `json:"spread,omitempty"`
	TelegraphTicks  int    `json:"telegraph_ticks,omitempty"`
}

type Trait struct {
	Kind   string `json:"kind"`
	Amount int    `json:"amount,omitempty"`
	Value  string `json:"value,omitempty"`
}

type Enemy struct {
	Slug           string   `json:"slug"`
	ChapterSlug    string   `json:"chapter_slug,omitempty"`
	NameKey        string   `json:"name_key"`
	DescriptionKey string   `json:"description_key"`
	Kind           string   `json:"kind"`
	MaxHealth      int      `json:"max_health"`
	Speed          int      `json:"speed"`
	ContactDamage  int      `json:"contact_damage"`
	ColorTheme     string   `json:"color_theme"`
	ImageURL       string   `json:"image_url"`
	Movement       Movement `json:"movement"`
	Attacks        []Attack `json:"attacks"`
	Traits         []Trait  `json:"traits"`
}

type Objective struct {
	Kind   string `json:"kind"`
	Target int    `json:"target"`
}

type Encounter struct {
	Slug          string    `json:"slug"`
	ChapterSlug   string    `json:"chapter_slug"`
	Kind          string    `json:"kind"`
	Objective     Objective `json:"objective"`
	DurationTicks int       `json:"duration_ticks"`
	MaxTicks      int       `json:"max_ticks"`
	SpawnInterval int       `json:"spawn_interval"`
	MaxAlive      int       `json:"max_alive"`
	EnemySlugs    []string  `json:"enemy_slugs"`
	Hazards       []string  `json:"hazards"`
	RewardBias    string    `json:"reward_bias"`
	Tutorial      bool      `json:"tutorial,omitempty"`
	Risk          int       `json:"risk"`
}

type StoryMetrics struct {
	Trust        int `json:"trust"`
	Authenticity int `json:"authenticity"`
	Retention    int `json:"retention"`
}

type EventOption struct {
	Slug      string       `json:"slug"`
	LabelKey  string       `json:"label_key"`
	ResultKey string       `json:"result_key"`
	Effects   []Effect     `json:"effects"`
	ChoiceTag string       `json:"choice_tag,omitempty"`
	Metrics   StoryMetrics `json:"metrics,omitempty"`
}

type Event struct {
	Slug        string        `json:"slug"`
	ChapterSlug string        `json:"chapter_slug"`
	TitleKey    string        `json:"title_key"`
	BodyKey     string        `json:"body_key"`
	Options     []EventOption `json:"options"`
}

type StoryTrigger struct {
	Kind        string `json:"kind"`
	ChapterSlug string `json:"chapter_slug,omitempty"`
	Ending      string `json:"ending,omitempty"`
}

type StoryMessage struct {
	Sender  string `json:"sender"`
	Kind    string `json:"kind"`
	TextKey string `json:"text_key"`
}

type StoryOption struct {
	Slug     string       `json:"slug"`
	LabelKey string       `json:"label_key"`
	Tag      string       `json:"tag"`
	Metrics  StoryMetrics `json:"metrics"`
}

type StoryScene struct {
	Slug        string         `json:"slug"`
	ChapterSlug string         `json:"chapter_slug,omitempty"`
	TitleKey    string         `json:"title_key"`
	Trigger     StoryTrigger   `json:"trigger"`
	Messages    []StoryMessage `json:"messages"`
	Options     []StoryOption  `json:"options"`
}

type NoiseRule struct {
	Level     int      `json:"level"`
	Modifiers []Effect `json:"modifiers"`
}

type Chapter struct {
	Slug                  string      `json:"slug"`
	Order                 int         `json:"order"`
	TitleKey              string      `json:"title_key"`
	SubtitleKey           string      `json:"subtitle_key"`
	CharacterSlug         string      `json:"character_slug,omitempty"`
	Finale                bool        `json:"finale"`
	NextChapterSlug       string      `json:"next_chapter_slug,omitempty"`
	BossEncounterSlug     string      `json:"boss_encounter_slug"`
	TutorialEncounterSlug string      `json:"tutorial_encounter_slug,omitempty"`
	EncounterPool         []string    `json:"encounter_pool"`
	ElitePool             []string    `json:"elite_pool"`
	EventPool             []string    `json:"event_pool"`
	MidpointEventSlug     string      `json:"midpoint_event_slug"`
	BackgroundURL         string      `json:"background_url"`
	KitSlug               string      `json:"kit_slug,omitempty"`
	PreludeSceneSlug      string      `json:"prelude_scene_slug"`
	MidpointSceneSlug     string      `json:"midpoint_scene_slug"`
	EpilogueSceneSlug     string      `json:"epilogue_scene_slug"`
	Available             bool        `json:"available"`
	NoiseRules            []NoiseRule `json:"noise_rules"`
}

type Bundle struct {
	Version    string       `json:"version"`
	Protocol   string       `json:"protocol"`
	Characters []Character  `json:"characters"`
	Kits       []Kit        `json:"kits"`
	Modules    []Module     `json:"modules"`
	Plugins    []Plugin     `json:"plugins"`
	Enemies    []Enemy      `json:"enemies"`
	Encounters []Encounter  `json:"encounters"`
	Events     []Event      `json:"events"`
	Scenes     []StoryScene `json:"scenes"`
	Chapters   []Chapter    `json:"chapters"`
}

type Catalog struct {
	Bundle
	Manifest Manifest
	Locales  map[string]map[string]string

	characters map[string]Character
	kits       map[string]Kit
	modules    map[string]Module
	plugins    map[string]Plugin
	enemies    map[string]Enemy
	encounters map[string]Encounter
	events     map[string]Event
	scenes     map[string]StoryScene
	chapters   map[string]Chapter
	assets     map[string]bool
}

func Load(version string) (*Catalog, error) {
	if version != CurrentVersion {
		return nil, fmt.Errorf("content: unsupported version %q", version)
	}
	prefix := version + "/"
	var manifest Manifest
	if err := decodeFile(prefix+"manifest.json", &manifest); err != nil {
		return nil, err
	}
	var shared SharedDocument
	if err := decodeFile(prefix+"shared.json", &shared); err != nil {
		return nil, err
	}
	bundle := Bundle{Version: manifest.Version, Protocol: manifest.Protocol, Characters: shared.Characters, Kits: shared.Kits, Modules: shared.Modules, Plugins: shared.Plugins, Enemies: shared.Enemies}
	for _, filename := range manifest.ChapterFiles {
		clean := path.Clean(filename)
		if !strings.HasPrefix(clean, "chapters/") || !strings.HasSuffix(clean, ".json") {
			return nil, fmt.Errorf("content: invalid chapter file %q", filename)
		}
		var document ChapterDocument
		if err := decodeFile(prefix+clean, &document); err != nil {
			return nil, err
		}
		bundle.Chapters = append(bundle.Chapters, document.Chapter)
		bundle.Enemies = append(bundle.Enemies, document.Enemies...)
		bundle.Encounters = append(bundle.Encounters, document.Encounters...)
		bundle.Events = append(bundle.Events, document.Events...)
		bundle.Scenes = append(bundle.Scenes, document.Scenes...)
	}
	catalog := &Catalog{Bundle: bundle, Manifest: manifest, Locales: make(map[string]map[string]string)}
	for _, locale := range manifest.Locales {
		var document LocaleDocument
		if err := decodeFile(prefix+"locales/"+locale+".json", &document); err != nil {
			return nil, err
		}
		if document.Locale != locale {
			return nil, fmt.Errorf("content: locale document %q identifies as %q", locale, document.Locale)
		}
		catalog.Locales[locale] = document.Strings
	}
	if err := catalog.indexAndValidate(); err != nil {
		return nil, err
	}
	return catalog, nil
}

func decodeFile(filename string, destination any) error {
	data, err := Files.ReadFile(filename)
	if err != nil {
		return fmt.Errorf("content: read %s: %w", filename, err)
	}
	decoder := json.NewDecoder(strings.NewReader(string(data)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		return fmt.Errorf("content: decode %s: %w", filename, err)
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return fmt.Errorf("content: decode %s: trailing JSON data", filename)
	}
	return nil
}

func MustLoad(version string) *Catalog {
	catalog, err := Load(version)
	if err != nil {
		panic(err)
	}
	return catalog
}

func (catalog *Catalog) Text(locale, key string) string {
	values, ok := catalog.Locales[locale]
	if !ok {
		values = catalog.Locales[catalog.Manifest.DefaultLocale]
	}
	return values[key]
}

func (catalog *Catalog) Character(slug string) (Character, bool) {
	item, ok := catalog.characters[slug]
	return item, ok
}
func (catalog *Catalog) Kit(slug string) (Kit, bool) { item, ok := catalog.kits[slug]; return item, ok }
func (catalog *Catalog) Module(slug string) (Module, bool) {
	item, ok := catalog.modules[slug]
	return item, ok
}
func (catalog *Catalog) Plugin(slug string) (Plugin, bool) {
	item, ok := catalog.plugins[slug]
	return item, ok
}
func (catalog *Catalog) Enemy(slug string) (Enemy, bool) {
	item, ok := catalog.enemies[slug]
	return item, ok
}
func (catalog *Catalog) Encounter(slug string) (Encounter, bool) {
	item, ok := catalog.encounters[slug]
	return item, ok
}
func (catalog *Catalog) Event(slug string) (Event, bool) {
	item, ok := catalog.events[slug]
	return item, ok
}
func (catalog *Catalog) Scene(slug string) (StoryScene, bool) {
	item, ok := catalog.scenes[slug]
	return item, ok
}
func (catalog *Catalog) Chapter(slug string) (Chapter, bool) {
	item, ok := catalog.chapters[slug]
	return item, ok
}

func (catalog *Catalog) RewardModules(character string) []Module {
	return slices.DeleteFunc(slices.Clone(catalog.Modules), func(item Module) bool { return item.CharacterSlug != "" && item.CharacterSlug != character })
}

func (catalog *Catalog) indexAndValidate() error {
	if catalog.Version != CurrentVersion || catalog.Manifest.Version != CurrentVersion || catalog.Protocol != CurrentProtocol || catalog.Manifest.Protocol != CurrentProtocol {
		return fmt.Errorf("content: expected %s/%s, got %s/%s", CurrentVersion, CurrentProtocol, catalog.Version, catalog.Protocol)
	}
	if catalog.Manifest.DefaultLocale != "en" || !slices.Equal(catalog.Manifest.Locales, []string{"en", "zh-CN"}) {
		return errors.New("content: locales must be en and zh-CN with English as default")
	}
	if catalog.Manifest.Limits != (EntityLimits{18, 160, 64, 6, 96}) {
		return errors.New("content: entity limits do not match action-v2")
	}
	catalog.assets = make(map[string]bool, len(catalog.Manifest.Assets))
	for _, asset := range catalog.Manifest.Assets {
		if !validAssetPath(asset) || catalog.assets[asset] {
			return fmt.Errorf("content: invalid or duplicate asset %q", asset)
		}
		catalog.assets[asset] = true
	}
	if len(catalog.assets) == 0 {
		return errors.New("content: manifest has no assets")
	}
	if err := catalog.validateLocaleParity(); err != nil {
		return err
	}
	catalog.characters, catalog.kits = map[string]Character{}, map[string]Kit{}
	catalog.modules, catalog.plugins = map[string]Module{}, map[string]Plugin{}
	catalog.enemies, catalog.encounters = map[string]Enemy{}, map[string]Encounter{}
	catalog.events, catalog.scenes, catalog.chapters = map[string]Event{}, map[string]StoryScene{}, map[string]Chapter{}
	for _, item := range catalog.Characters {
		if item.Slug == "" || item.ColorTheme == "" || !catalog.assets[item.PortraitURL] || !catalog.assets[item.ModelURL] || item.KitSlug == "" || !catalog.keysExist(item.NameKey, item.BiographyKey, item.PlaystyleKey) {
			return fmt.Errorf("content: character %q is incomplete", item.Slug)
		}
		if _, exists := catalog.characters[item.Slug]; exists {
			return fmt.Errorf("content: duplicate character %q", item.Slug)
		}
		catalog.characters[item.Slug] = item
	}
	if len(catalog.characters) != 7 {
		return fmt.Errorf("content: expected seven characters, got %d", len(catalog.characters))
	}
	kitKinds := stringSet("nana_route_chain", "diana_cheer_pulse", "ava_afterimage", "bella_perfect_warp", "lulu_convert_projectiles", "xingtong_signal_stance", "nailu_memory_bloom")
	for _, item := range catalog.Kits {
		stats := item.BaseStats
		if item.Slug == "" || !kitKinds[item.Passive] || !kitKinds[item.Resonance] || stats.MaxHealth <= 0 || stats.AttackDamage <= 0 || stats.AttackInterval <= 0 || stats.MoveSpeed <= 0 || stats.WarpCooldown <= 0 || stats.WarpDamage <= 0 {
			return fmt.Errorf("content: kit %q is invalid", item.Slug)
		}
		if _, ok := catalog.characters[item.CharacterSlug]; !ok {
			return fmt.Errorf("content: kit %q references unknown character", item.Slug)
		}
		if _, exists := catalog.kits[item.Slug]; exists {
			return fmt.Errorf("content: duplicate kit %q", item.Slug)
		}
		catalog.kits[item.Slug] = item
	}
	if len(catalog.kits) != 7 {
		return fmt.Errorf("content: expected seven kits, got %d", len(catalog.kits))
	}
	for _, character := range catalog.Characters {
		kit, ok := catalog.kits[character.KitSlug]
		if !ok || kit.CharacterSlug != character.Slug {
			return fmt.Errorf("content: character %q has invalid kit", character.Slug)
		}
	}
	validArchetype, validRarity := stringSet("surge", "guard", "echo", "glitch"), stringSet("common", "uncommon", "rare")
	for _, item := range catalog.Modules {
		if item.Slug == "" || !validArchetype[item.Archetype] || !validRarity[item.Rarity] || len(item.Levels) != 3 || !catalog.keysExist(item.NameKey, item.DescriptionKey) {
			return fmt.Errorf("content: module %q is invalid", item.Slug)
		}
		if item.CharacterSlug != "" {
			if _, ok := catalog.characters[item.CharacterSlug]; !ok {
				return fmt.Errorf("content: module %q references unknown character", item.Slug)
			}
		}
		for _, level := range item.Levels {
			if len(level.Effects) == 0 {
				return fmt.Errorf("content: module %q has an empty level", item.Slug)
			}
		}
		if _, exists := catalog.modules[item.Slug]; exists {
			return fmt.Errorf("content: duplicate module %q", item.Slug)
		}
		catalog.modules[item.Slug] = item
	}
	if len(catalog.modules) != 68 {
		return fmt.Errorf("content: expected 68 modules, got %d", len(catalog.modules))
	}
	moduleCounts := map[string]int{"": 0}
	for _, item := range catalog.Modules {
		moduleCounts[item.CharacterSlug]++
	}
	if moduleCounts[""] != 12 {
		return fmt.Errorf("content: expected 12 shared modules, got %d", moduleCounts[""])
	}
	for _, character := range catalog.Characters {
		if moduleCounts[character.Slug] != 8 {
			return fmt.Errorf("content: character %q needs eight modules", character.Slug)
		}
	}
	for _, item := range catalog.Plugins {
		if item.Slug == "" || len(item.Effects) == 0 || !catalog.keysExist(item.NameKey, item.DescriptionKey) {
			return fmt.Errorf("content: plugin %q is invalid", item.Slug)
		}
		if item.CharacterSlug != "" {
			if _, ok := catalog.characters[item.CharacterSlug]; !ok {
				return fmt.Errorf("content: plugin %q references unknown character", item.Slug)
			}
		}
		if _, exists := catalog.plugins[item.Slug]; exists {
			return fmt.Errorf("content: duplicate plugin %q", item.Slug)
		}
		catalog.plugins[item.Slug] = item
	}
	if len(catalog.plugins) != 20 {
		return fmt.Errorf("content: expected 20 plugins, got %d", len(catalog.plugins))
	}
	pluginCounts := map[string]int{"": 0}
	for _, item := range catalog.Plugins {
		pluginCounts[item.CharacterSlug]++
	}
	if pluginCounts[""] != 6 {
		return fmt.Errorf("content: expected six shared plugins, got %d", pluginCounts[""])
	}
	for _, character := range catalog.Characters {
		if pluginCounts[character.Slug] != 2 {
			return fmt.Errorf("content: character %q needs two plugins", character.Slug)
		}
	}
	for _, item := range catalog.Enemies {
		if err := catalog.indexEnemy(item); err != nil {
			return err
		}
	}
	for _, item := range catalog.Enemies {
		for _, trait := range item.Traits {
			switch trait.Kind {
			case "death_split":
				if trait.Amount < 1 || trait.Amount > 3 {
					return fmt.Errorf("content: enemy %q has invalid death split count %d", item.Slug, trait.Amount)
				}
				if _, ok := catalog.enemies[trait.Value]; !ok || trait.Value == item.Slug {
					return fmt.Errorf("content: enemy %q has invalid death split target %q", item.Slug, trait.Value)
				}
			case "linked_shield":
				if trait.Amount < 1 || trait.Amount > 5 {
					return fmt.Errorf("content: enemy %q has invalid linked shield strength %d", item.Slug, trait.Amount)
				}
				if _, ok := catalog.enemies[trait.Value]; !ok || trait.Value == item.Slug {
					return fmt.Errorf("content: enemy %q has invalid linked shield target %q", item.Slug, trait.Value)
				}
			}
		}
	}
	for _, item := range catalog.Encounters {
		if err := catalog.indexEncounter(item); err != nil {
			return err
		}
	}
	for _, item := range catalog.Events {
		if err := catalog.indexEvent(item); err != nil {
			return err
		}
	}
	for _, item := range catalog.Scenes {
		if err := catalog.indexScene(item); err != nil {
			return err
		}
	}
	for _, item := range catalog.Chapters {
		if err := catalog.indexChapter(item); err != nil {
			return err
		}
	}
	if len(catalog.chapters) != 8 {
		return fmt.Errorf("content: expected seven chapters and a finale, got %d", len(catalog.chapters))
	}
	if len(catalog.enemies) != 36 || len(catalog.encounters) != 47 || len(catalog.events) != 28 || len(catalog.scenes) != 34 {
		return fmt.Errorf("content: incomplete campaign counts enemies=%d encounters=%d events=%d scenes=%d", len(catalog.enemies), len(catalog.encounters), len(catalog.events), len(catalog.scenes))
	}
	orders := make(map[int]string, 8)
	finales := 0
	for _, chapter := range catalog.Chapters {
		if previous := orders[chapter.Order]; previous != "" {
			return fmt.Errorf("content: chapters %q and %q share order %d", previous, chapter.Slug, chapter.Order)
		}
		orders[chapter.Order] = chapter.Slug
		if chapter.Finale {
			finales++
			continue
		}
		bossBranches := 0
		for _, scene := range catalog.Scenes {
			if scene.ChapterSlug == chapter.Slug && scene.Trigger.Kind == "chapter_midpoint" && scene.Slug != chapter.MidpointSceneSlug {
				bossBranches++
			}
		}
		if bossBranches != 1 {
			return fmt.Errorf("content: chapter %q needs one boss branch scene", chapter.Slug)
		}
	}
	if finales != 1 {
		return fmt.Errorf("content: expected one finale, got %d", finales)
	}
	for _, module := range catalog.Modules {
		for levelIndex, level := range module.Levels {
			if err := catalog.validateEffects(level.Effects); err != nil {
				return fmt.Errorf("content: module %q: %w", module.Slug, err)
			}
			for _, behavior := range level.Behaviors {
				if err := validateBehavior(behavior); err != nil {
					return fmt.Errorf("content: module %q level %d: %w", module.Slug, levelIndex+1, err)
				}
			}
		}
	}
	for _, plugin := range catalog.Plugins {
		if err := catalog.validateEffects(plugin.Effects); err != nil {
			return fmt.Errorf("content: plugin %q: %w", plugin.Slug, err)
		}
	}
	for _, event := range catalog.Events {
		for _, option := range event.Options {
			if err := catalog.validateEffects(option.Effects); err != nil {
				return fmt.Errorf("content: event %q: %w", event.Slug, err)
			}
		}
	}
	for _, chapter := range catalog.Chapters {
		if err := catalog.validateChapterReferences(chapter); err != nil {
			return err
		}
	}
	return nil
}

func validateBehavior(behavior Behavior) error {
	if behavior.Amount <= 0 || behavior.Amount > 50 {
		return fmt.Errorf("behavior %q has invalid amount", behavior.Kind)
	}
	switch behavior.Kind {
	case "warp_aftershock":
		if behavior.Every != 0 {
			return fmt.Errorf("behavior %q cannot set every", behavior.Kind)
		}
	case "graze_guard", "protocol_echo", "kill_signal":
		if behavior.Every < 2 || behavior.Every > 12 {
			return fmt.Errorf("behavior %q has invalid cadence", behavior.Kind)
		}
	default:
		return fmt.Errorf("unsupported behavior %q", behavior.Kind)
	}
	return nil
}

func (catalog *Catalog) validateLocaleParity() error {
	en, zh := catalog.Locales["en"], catalog.Locales["zh-CN"]
	if len(en) == 0 || len(en) != len(zh) {
		return errors.New("content: locale key sets differ")
	}
	for key, value := range en {
		if strings.TrimSpace(key) == "" || strings.TrimSpace(value) == "" || strings.TrimSpace(zh[key]) == "" {
			return fmt.Errorf("content: missing translation for %q", key)
		}
	}
	for key := range zh {
		if _, ok := en[key]; !ok {
			return fmt.Errorf("content: unexpected zh-CN key %q", key)
		}
	}
	return nil
}

func (catalog *Catalog) keysExist(keys ...string) bool {
	for _, key := range keys {
		if strings.TrimSpace(catalog.Locales["en"][key]) == "" || strings.TrimSpace(catalog.Locales["zh-CN"][key]) == "" {
			return false
		}
	}
	return true
}
func stringSet(values ...string) map[string]bool {
	result := make(map[string]bool, len(values))
	for _, value := range values {
		result[value] = true
	}
	return result
}

func validAssetPath(asset string) bool {
	if path.Clean(asset) != asset || !strings.HasPrefix(asset, "/game/v3/") || !strings.HasSuffix(asset, ".webp") {
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

func (catalog *Catalog) indexEnemy(item Enemy) error {
	validKind := stringSet("normal", "elite", "boss")
	validMovement := stringSet("chase", "orbit", "strafe", "charge", "flee", "stationary", "wander")
	validAttack := stringSet("aimed", "fan", "ring", "spiral", "delayed_echo", "mine", "beam")
	validTrait := stringSet("linked_shield", "steal_signal", "death_split", "armored", "distortion_aura", "teleport")
	if item.Slug == "" || !validKind[item.Kind] || !validMovement[item.Movement.Kind] || item.MaxHealth <= 0 || item.Speed < 0 || item.ContactDamage < 0 || item.ColorTheme == "" || !catalog.assets[item.ImageURL] || !catalog.keysExist(item.NameKey, item.DescriptionKey) {
		return fmt.Errorf("content: enemy %q is invalid", item.Slug)
	}
	if len(item.Attacks) == 0 {
		return fmt.Errorf("content: enemy %q has no attack", item.Slug)
	}
	for _, attack := range item.Attacks {
		if !validAttack[attack.Kind] || attack.Interval < 20 || attack.Damage <= 0 || (attack.Kind != "beam" && attack.ProjectileSpeed <= 0) || attack.TelegraphTicks < 0 || attack.Count < 0 || attack.Count > 16 || attack.Spread < 0 || (attack.Damage >= 8 && attack.TelegraphTicks == 0) {
			return fmt.Errorf("content: enemy %q has invalid attack %q", item.Slug, attack.Kind)
		}
	}
	for _, trait := range item.Traits {
		if !validTrait[trait.Kind] {
			return fmt.Errorf("content: enemy %q has invalid trait %q", item.Slug, trait.Kind)
		}
	}
	if _, exists := catalog.enemies[item.Slug]; exists {
		return fmt.Errorf("content: duplicate enemy %q", item.Slug)
	}
	catalog.enemies[item.Slug] = item
	return nil
}

func (catalog *Catalog) indexEncounter(item Encounter) error {
	validKind := stringSet("tutorial", "normal", "elite", "boss", "daily")
	validObjective := stringSet("purge", "stabilize", "recover", "holdout", "elite", "boss")
	validHazard := stringSet("narrow_arena", "distortion_rain", "signal_decay", "crossfire")
	validBias := stringSet("surge", "guard", "echo", "glitch", "balanced")
	if item.Slug == "" || !validKind[item.Kind] || !validObjective[item.Objective.Kind] || item.Objective.Target <= 0 || item.DurationTicks <= 0 || item.DurationTicks > item.MaxTicks || item.MaxTicks > 2700 || (item.Kind != "boss" && item.MaxTicks > 1800) || item.SpawnInterval <= 0 || item.MaxAlive <= 0 || item.MaxAlive > catalog.Manifest.Limits.MaxEnemies || len(item.EnemySlugs) == 0 || !validBias[item.RewardBias] || item.Risk < 1 || item.Risk > 3 {
		return fmt.Errorf("content: encounter %q is invalid", item.Slug)
	}
	for _, slug := range item.EnemySlugs {
		if _, ok := catalog.enemies[slug]; !ok {
			return fmt.Errorf("content: encounter %q references enemy %q", item.Slug, slug)
		}
	}
	for _, hazard := range item.Hazards {
		if !validHazard[hazard] {
			return fmt.Errorf("content: encounter %q has unknown hazard %q", item.Slug, hazard)
		}
	}
	if _, exists := catalog.encounters[item.Slug]; exists {
		return fmt.Errorf("content: duplicate encounter %q", item.Slug)
	}
	catalog.encounters[item.Slug] = item
	return nil
}

func (catalog *Catalog) indexEvent(item Event) error {
	if item.Slug == "" || item.ChapterSlug == "" || len(item.Options) < 2 || !catalog.keysExist(item.TitleKey, item.BodyKey) {
		return fmt.Errorf("content: event %q is invalid", item.Slug)
	}
	seen := map[string]bool{}
	for _, option := range item.Options {
		if option.Slug == "" || seen[option.Slug] || !catalog.keysExist(option.LabelKey, option.ResultKey) {
			return fmt.Errorf("content: event %q has invalid option %q", item.Slug, option.Slug)
		}
		seen[option.Slug] = true
	}
	if _, exists := catalog.events[item.Slug]; exists {
		return fmt.Errorf("content: duplicate event %q", item.Slug)
	}
	catalog.events[item.Slug] = item
	return nil
}

func (catalog *Catalog) indexScene(item StoryScene) error {
	validTrigger := stringSet("new_player", "chapter_prelude", "chapter_midpoint", "chapter_cleared", "finale_unlocked", "ending")
	if item.Slug == "" || !validTrigger[item.Trigger.Kind] || len(item.Messages) == 0 || len(item.Options) == 0 || !catalog.keysExist(item.TitleKey) {
		return fmt.Errorf("content: scene %q is invalid", item.Slug)
	}
	if item.Trigger.Kind == "ending" && item.Trigger.Ending != "authentic" && item.Trigger.Ending != "balanced" && item.Trigger.Ending != "retained" {
		return fmt.Errorf("content: scene %q has invalid ending", item.Slug)
	}
	seen := map[string]bool{}
	for _, message := range item.Messages {
		if message.Sender == "" || (message.Kind != "system" && message.Kind != "character") || !catalog.keysExist(message.TextKey) {
			return fmt.Errorf("content: scene %q has invalid message", item.Slug)
		}
	}
	for _, option := range item.Options {
		if option.Slug == "" || option.Tag == "" || seen[option.Slug] || !catalog.keysExist(option.LabelKey) {
			return fmt.Errorf("content: scene %q has invalid option", item.Slug)
		}
		seen[option.Slug] = true
	}
	if _, exists := catalog.scenes[item.Slug]; exists {
		return fmt.Errorf("content: duplicate scene %q", item.Slug)
	}
	catalog.scenes[item.Slug] = item
	return nil
}

func (catalog *Catalog) indexChapter(item Chapter) error {
	if item.Slug == "" || item.Order < 1 || item.Order > 8 || !item.Available || item.BossEncounterSlug == "" || len(item.EncounterPool) < 2 || len(item.ElitePool) < 1 || (!item.Finale && (len(item.EventPool) < 1 || item.MidpointEventSlug == "")) || !catalog.assets[item.BackgroundURL] || item.PreludeSceneSlug == "" || item.MidpointSceneSlug == "" || item.EpilogueSceneSlug == "" || !catalog.keysExist(item.TitleKey, item.SubtitleKey) {
		return fmt.Errorf("content: chapter %q is invalid", item.Slug)
	}
	if item.Finale {
		if item.CharacterSlug != "" || item.Order != 8 {
			return fmt.Errorf("content: finale %q is invalid", item.Slug)
		}
	} else {
		if _, ok := catalog.characters[item.CharacterSlug]; !ok {
			return fmt.Errorf("content: chapter %q references unknown character", item.Slug)
		}
		kit, ok := catalog.kits[item.KitSlug]
		if !ok || kit.CharacterSlug != item.CharacterSlug {
			return fmt.Errorf("content: chapter %q references invalid kit", item.Slug)
		}
	}
	if len(item.NoiseRules) != 3 {
		return fmt.Errorf("content: chapter %q needs three noise rules", item.Slug)
	}
	for index, rule := range item.NoiseRules {
		if rule.Level != index+1 || len(rule.Modifiers) == 0 {
			return fmt.Errorf("content: chapter %q has invalid noise rules", item.Slug)
		}
		for _, modifier := range rule.Modifiers {
			// Noise modifiers must only increase systemic pressure. Applying ordinary
			// module effects here would accidentally make higher difficulties buff the
			// player, because the runtime resolver intentionally shares Effect values.
			if modifier.Kind != "distortion_gain" || modifier.Amount <= 0 || modifier.Value != "" {
				return fmt.Errorf("content: chapter %q noise level %d has unsafe modifier %q", item.Slug, rule.Level, modifier.Kind)
			}
		}
	}
	if _, exists := catalog.chapters[item.Slug]; exists {
		return fmt.Errorf("content: duplicate chapter %q", item.Slug)
	}
	catalog.chapters[item.Slug] = item
	return nil
}

func (catalog *Catalog) validateChapterReferences(item Chapter) error {
	encounters := append(slices.Clone(item.EncounterPool), item.ElitePool...)
	encounters = append(encounters, item.BossEncounterSlug)
	if item.TutorialEncounterSlug != "" {
		encounters = append(encounters, item.TutorialEncounterSlug)
	}
	for _, slug := range encounters {
		definition, ok := catalog.encounters[slug]
		if !ok || definition.ChapterSlug != item.Slug {
			return fmt.Errorf("content: chapter %q references encounter %q", item.Slug, slug)
		}
	}
	events := slices.Clone(item.EventPool)
	if item.MidpointEventSlug != "" {
		events = append(events, item.MidpointEventSlug)
	}
	for _, slug := range events {
		definition, ok := catalog.events[slug]
		if !ok || definition.ChapterSlug != item.Slug {
			return fmt.Errorf("content: chapter %q references event %q", item.Slug, slug)
		}
	}
	for _, slug := range []string{item.PreludeSceneSlug, item.MidpointSceneSlug, item.EpilogueSceneSlug} {
		definition, ok := catalog.scenes[slug]
		if !ok || (definition.ChapterSlug != "" && definition.ChapterSlug != item.Slug) {
			return fmt.Errorf("content: chapter %q references scene %q", item.Slug, slug)
		}
	}
	if item.NextChapterSlug != "" {
		next, ok := catalog.chapters[item.NextChapterSlug]
		if !ok || next.Order != item.Order+1 {
			return fmt.Errorf("content: chapter %q has invalid successor", item.Slug)
		}
	}
	return nil
}

func (catalog *Catalog) validateEffects(effects []Effect) error {
	positive := stringSet("heal_run", "damage_run", "attack_damage", "attack_speed", "move_speed", "warp_cooldown", "warp_damage", "starting_shield", "overload_bonus", "distortion_gain", "protocol_damage", "protocol_shield", "echo_power", "resonance_power", "projectile_pierce", "projectile_count", "projectile_speed", "graze_radius", "heal_on_protocol", "reflect_damage", "max_health", "reroll_charge")
	for _, effect := range effects {
		switch {
		case positive[effect.Kind] && effect.Amount > 0:
		case effect.Kind == "add_module":
			if _, ok := catalog.modules[effect.Value]; !ok {
				return fmt.Errorf("unknown module %q", effect.Value)
			}
		case effect.Kind == "add_plugin":
			if _, ok := catalog.plugins[effect.Value]; !ok {
				return fmt.Errorf("unknown plugin %q", effect.Value)
			}
		default:
			return fmt.Errorf("unsupported effect %q", effect.Kind)
		}
	}
	return nil
}
