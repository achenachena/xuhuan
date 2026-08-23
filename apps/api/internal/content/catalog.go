package content

import (
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

const CurrentVersion = "v2"

// Files contains immutable content. A run keeps the exact version it started
// with so action rules and authored text cannot change underneath a replay.
//
//go:embed v2/*.json
var Files embed.FS

type LocalizedText struct {
	ZHCN string `json:"zh-CN"`
	EN   string `json:"en"`
}

func (text LocalizedText) Resolve(language string) string {
	if strings.HasPrefix(strings.ToLower(language), "en") {
		return text.EN
	}
	return text.ZHCN
}

type Character struct {
	Slug        string        `json:"slug"`
	Name        LocalizedText `json:"name"`
	Biography   LocalizedText `json:"biography"`
	Playstyle   LocalizedText `json:"playstyle"`
	ColorTheme  string        `json:"color_theme"`
	PortraitURL string        `json:"portrait_url"`
	ModelURL    string        `json:"model_url"`
	Available   bool          `json:"available"`
}

type Effect struct {
	Kind   string `json:"kind"`
	Amount int    `json:"amount,omitempty"`
	Status string `json:"status,omitempty"`
}

type Module struct {
	Slug          string        `json:"slug"`
	CharacterSlug string        `json:"character_slug,omitempty"`
	Name          LocalizedText `json:"name"`
	Description   LocalizedText `json:"description"`
	Archetype     string        `json:"archetype"`
	Rarity        string        `json:"rarity"`
	Effects       []Effect      `json:"effects"`
}

type Plugin struct {
	Slug        string        `json:"slug"`
	Name        LocalizedText `json:"name"`
	Description LocalizedText `json:"description"`
	Effects     []Effect      `json:"effects"`
}

type Enemy struct {
	Slug             string        `json:"slug"`
	Name             LocalizedText `json:"name"`
	Description      LocalizedText `json:"description"`
	Kind             string        `json:"kind"`
	Pattern          string        `json:"pattern"`
	MaxHealth        int           `json:"max_health"`
	Speed            int           `json:"speed"`
	ContactDamage    int           `json:"contact_damage"`
	FireInterval     int           `json:"fire_interval"`
	ProjectileSpeed  int           `json:"projectile_speed"`
	ProjectileDamage int           `json:"projectile_damage"`
	ColorTheme       string        `json:"color_theme"`
	ImageURL         string        `json:"image_url"`
}

type Encounter struct {
	Slug          string   `json:"slug"`
	Kind          string   `json:"kind"`
	DurationTicks int      `json:"duration_ticks"`
	MaxTicks      int      `json:"max_ticks"`
	SpawnInterval int      `json:"spawn_interval"`
	MaxAlive      int      `json:"max_alive"`
	EnemySlugs    []string `json:"enemy_slugs"`
	Tutorial      bool     `json:"tutorial,omitempty"`
}

type EventOption struct {
	Slug      string        `json:"slug"`
	Label     LocalizedText `json:"label"`
	Result    LocalizedText `json:"result"`
	Effects   []Effect      `json:"effects"`
	ChoiceTag string        `json:"choice_tag,omitempty"`
}
type Event struct {
	Slug    string        `json:"slug"`
	Title   LocalizedText `json:"title"`
	Body    LocalizedText `json:"body"`
	Options []EventOption `json:"options"`
}
type StoryMessage struct {
	Sender string        `json:"sender"`
	Kind   string        `json:"kind"`
	Text   LocalizedText `json:"text"`
}
type StoryOption struct {
	Slug  string        `json:"slug"`
	Label LocalizedText `json:"label"`
	Tag   string        `json:"tag"`
}
type StoryScene struct {
	Slug     string         `json:"slug"`
	Title    LocalizedText  `json:"title"`
	Trigger  string         `json:"trigger"`
	Messages []StoryMessage `json:"messages"`
	Options  []StoryOption  `json:"options"`
}
type Chapter struct {
	Slug              string        `json:"slug"`
	Title             LocalizedText `json:"title"`
	Subtitle          LocalizedText `json:"subtitle"`
	CharacterSlug     string        `json:"character_slug"`
	Available         bool          `json:"available"`
	BossEncounterSlug string        `json:"boss_encounter_slug"`
}

type Bundle struct {
	Version    string       `json:"version"`
	Characters []Character  `json:"characters"`
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
	characters map[string]Character
	modules    map[string]Module
	plugins    map[string]Plugin
	enemies    map[string]Enemy
	encounters map[string]Encounter
	events     map[string]Event
	scenes     map[string]StoryScene
	chapters   map[string]Chapter
}

func Load(version string) (*Catalog, error) {
	if version != CurrentVersion {
		return nil, fmt.Errorf("content: unsupported version %q", version)
	}
	data, err := Files.ReadFile(version + "/bundle.json")
	if err != nil {
		return nil, fmt.Errorf("content: read bundle: %w", err)
	}
	var bundle Bundle
	if err := json.Unmarshal(data, &bundle); err != nil {
		return nil, fmt.Errorf("content: decode bundle: %w", err)
	}
	catalog := &Catalog{Bundle: bundle}
	if err := catalog.indexAndValidate(); err != nil {
		return nil, err
	}
	return catalog, nil
}
func MustLoad(version string) *Catalog {
	catalog, err := Load(version)
	if err != nil {
		panic(err)
	}
	return catalog
}
func (catalog *Catalog) Character(slug string) (Character, bool) {
	item, ok := catalog.characters[slug]
	return item, ok
}
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
	result := make([]Module, 0, len(catalog.Modules))
	for _, item := range catalog.Modules {
		if item.CharacterSlug == character || item.CharacterSlug == "" {
			result = append(result, item)
		}
	}
	return result
}

func (catalog *Catalog) indexAndValidate() error {
	if catalog.Version != CurrentVersion {
		return fmt.Errorf("content: bundle version %q does not match %q", catalog.Version, CurrentVersion)
	}
	catalog.characters = make(map[string]Character)
	catalog.modules = make(map[string]Module)
	catalog.plugins = make(map[string]Plugin)
	catalog.enemies = make(map[string]Enemy)
	catalog.encounters = make(map[string]Encounter)
	catalog.events = make(map[string]Event)
	catalog.scenes = make(map[string]StoryScene)
	catalog.chapters = make(map[string]Chapter)
	for _, item := range catalog.Characters {
		if item.Slug == "" || item.PortraitURL == "" || item.ModelURL == "" || validateLocalized(item.Name, item.Biography, item.Playstyle) != nil {
			return fmt.Errorf("content: character %q is incomplete", item.Slug)
		}
		if _, exists := catalog.characters[item.Slug]; exists {
			return fmt.Errorf("content: duplicate character %q", item.Slug)
		}
		catalog.characters[item.Slug] = item
	}
	if len(catalog.characters) != 7 {
		return fmt.Errorf("content: expected seven story characters, got %d", len(catalog.characters))
	}
	validArchetype := map[string]bool{"route": true, "distortion": true, "echo": true, "glitch": true}
	validRarity := map[string]bool{"common": true, "uncommon": true, "rare": true}
	nanaModules := 0
	for _, item := range catalog.Modules {
		if item.Slug == "" || !validArchetype[item.Archetype] || !validRarity[item.Rarity] || len(item.Effects) == 0 || validateLocalized(item.Name, item.Description) != nil {
			return fmt.Errorf("content: module %q is invalid", item.Slug)
		}
		if item.CharacterSlug != "" {
			if _, ok := catalog.characters[item.CharacterSlug]; !ok {
				return fmt.Errorf("content: module %q references unknown character", item.Slug)
			}
		}
		if item.CharacterSlug == "nana7mi" {
			nanaModules++
		}
		if _, exists := catalog.modules[item.Slug]; exists {
			return fmt.Errorf("content: duplicate module %q", item.Slug)
		}
		catalog.modules[item.Slug] = item
	}
	if nanaModules < 24 {
		return fmt.Errorf("content: nana7mi needs at least 24 modules")
	}
	for _, item := range catalog.Plugins {
		if item.Slug == "" || len(item.Effects) == 0 || validateLocalized(item.Name, item.Description) != nil {
			return fmt.Errorf("content: plugin %q is invalid", item.Slug)
		}
		if _, exists := catalog.plugins[item.Slug]; exists {
			return fmt.Errorf("content: duplicate plugin %q", item.Slug)
		}
		catalog.plugins[item.Slug] = item
	}
	for _, item := range catalog.Modules {
		for _, effect := range item.Effects {
			if err := catalog.validateEffectReference(effect); err != nil {
				return fmt.Errorf("content: module %q: %w", item.Slug, err)
			}
		}
	}
	for _, item := range catalog.Plugins {
		for _, effect := range item.Effects {
			if err := catalog.validateEffectReference(effect); err != nil {
				return fmt.Errorf("content: plugin %q: %w", item.Slug, err)
			}
		}
	}
	for _, item := range catalog.Enemies {
		validKind := item.Kind == "normal" || item.Kind == "elite" || item.Kind == "boss"
		validPattern := item.Pattern == "chaser" || item.Pattern == "swarm" || item.Pattern == "turret" || item.Pattern == "sweeper" || item.Pattern == "mine" || item.Pattern == "orbiter" || item.Pattern == "sniper" || item.Pattern == "charger" || item.Pattern == "boss"
		validProjectile := item.FireInterval == 0 || item.Pattern == "charger" || (item.FireInterval >= 20 && item.ProjectileSpeed > 0 && item.ProjectileDamage > 0)
		if item.Slug == "" || !validKind || !validPattern || item.MaxHealth <= 0 || item.Speed < 0 || item.ContactDamage < 0 || !validProjectile || validateLocalized(item.Name, item.Description) != nil {
			return fmt.Errorf("content: enemy %q is invalid", item.Slug)
		}
		if _, exists := catalog.enemies[item.Slug]; exists {
			return fmt.Errorf("content: duplicate enemy %q", item.Slug)
		}
		catalog.enemies[item.Slug] = item
	}
	for _, item := range catalog.Encounters {
		validKind := item.Kind == "tutorial" || item.Kind == "normal" || item.Kind == "elite" || item.Kind == "boss"
		if item.Slug == "" || !validKind || item.DurationTicks <= 0 || item.DurationTicks > item.MaxTicks || item.MaxTicks > 2700 || item.SpawnInterval <= 0 || item.MaxAlive <= 0 || item.MaxAlive > 24 || len(item.EnemySlugs) == 0 {
			return fmt.Errorf("content: encounter %q is invalid", item.Slug)
		}
		for _, slug := range item.EnemySlugs {
			if _, ok := catalog.enemies[slug]; !ok {
				return fmt.Errorf("content: encounter %q references unknown enemy %q", item.Slug, slug)
			}
		}
		if _, exists := catalog.encounters[item.Slug]; exists {
			return fmt.Errorf("content: duplicate encounter %q", item.Slug)
		}
		catalog.encounters[item.Slug] = item
	}
	for _, item := range catalog.Events {
		if item.Slug == "" || len(item.Options) < 2 || validateLocalized(item.Title, item.Body) != nil {
			return fmt.Errorf("content: event %q is invalid", item.Slug)
		}
		optionSlugs := make(map[string]bool, len(item.Options))
		for _, option := range item.Options {
			if option.Slug == "" || validateLocalized(option.Label, option.Result) != nil {
				return fmt.Errorf("content: event option %q/%q is invalid", item.Slug, option.Slug)
			}
			if optionSlugs[option.Slug] {
				return fmt.Errorf("content: event %q has duplicate option %q", item.Slug, option.Slug)
			}
			optionSlugs[option.Slug] = true
			for _, effect := range option.Effects {
				if err := catalog.validateEffectReference(effect); err != nil {
					return fmt.Errorf("content: event %q: %w", item.Slug, err)
				}
			}
		}
		if _, exists := catalog.events[item.Slug]; exists {
			return fmt.Errorf("content: duplicate event %q", item.Slug)
		}
		catalog.events[item.Slug] = item
	}
	for _, item := range catalog.Scenes {
		if item.Slug == "" || len(item.Messages) == 0 || len(item.Options) == 0 || validateLocalized(item.Title) != nil {
			return fmt.Errorf("content: scene %q is invalid", item.Slug)
		}
		for _, message := range item.Messages {
			if message.Sender == "" || (message.Kind != "system" && message.Kind != "character") || validateLocalized(message.Text) != nil {
				return fmt.Errorf("content: scene %q is missing a translation", item.Slug)
			}
		}
		optionSlugs := make(map[string]bool, len(item.Options))
		for _, option := range item.Options {
			if option.Slug == "" || option.Tag == "" || optionSlugs[option.Slug] || validateLocalized(option.Label) != nil {
				return fmt.Errorf("content: scene %q is missing an option translation", item.Slug)
			}
			optionSlugs[option.Slug] = true
		}
		if _, exists := catalog.scenes[item.Slug]; exists {
			return fmt.Errorf("content: duplicate scene %q", item.Slug)
		}
		catalog.scenes[item.Slug] = item
	}
	for _, item := range catalog.Chapters {
		if item.Slug == "" || validateLocalized(item.Title, item.Subtitle) != nil {
			return fmt.Errorf("content: chapter %q is invalid", item.Slug)
		}
		if _, ok := catalog.characters[item.CharacterSlug]; !ok {
			return fmt.Errorf("content: chapter %q references unknown character", item.Slug)
		}
		if item.BossEncounterSlug != "" {
			boss, ok := catalog.encounters[item.BossEncounterSlug]
			if !ok || boss.Kind != "boss" {
				return fmt.Errorf("content: chapter %q references unknown boss encounter", item.Slug)
			}
		}
		if _, exists := catalog.chapters[item.Slug]; exists {
			return fmt.Errorf("content: duplicate chapter %q", item.Slug)
		}
		catalog.chapters[item.Slug] = item
	}
	return nil
}

func (catalog *Catalog) validateEffectReference(effect Effect) error {
	switch effect.Kind {
	case "heal_run", "damage_run", "attack_damage", "attack_speed", "move_speed", "dash_cooldown", "dash_damage", "starting_shield", "overload_bonus", "distortion_gain", "route_heal", "reflect_damage", "max_health":
		if effect.Amount <= 0 {
			return errors.New("effect amount must be positive")
		}
	case "add_module":
		if _, ok := catalog.modules[effect.Status]; !ok {
			return fmt.Errorf("unknown module %q", effect.Status)
		}
	case "add_plugin":
		if _, ok := catalog.plugins[effect.Status]; !ok {
			return fmt.Errorf("unknown plugin %q", effect.Status)
		}
	default:
		return fmt.Errorf("unsupported effect %q", effect.Kind)
	}
	return nil
}
func validateLocalized(values ...LocalizedText) error {
	for _, value := range values {
		if strings.TrimSpace(value.ZHCN) == "" || strings.TrimSpace(value.EN) == "" {
			return errors.New("missing translation")
		}
	}
	return nil
}
