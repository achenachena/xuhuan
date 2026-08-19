package content

import (
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

const CurrentVersion = "v1"

// Files contains immutable, versioned game content. Active runs keep their
// content version so a future content release cannot silently change the rules
// of a run that is already in progress.
//
//go:embed v1/*.json
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

type Card struct {
	Slug          string        `json:"slug"`
	CharacterSlug string        `json:"character_slug,omitempty"`
	Name          LocalizedText `json:"name"`
	Description   LocalizedText `json:"description"`
	Type          string        `json:"type"`
	Target        string        `json:"target"`
	Rarity        string        `json:"rarity"`
	Cost          int           `json:"cost"`
	StarterCopies int           `json:"starter_copies,omitempty"`
	Exhaust       bool          `json:"exhaust,omitempty"`
	Unplayable    bool          `json:"unplayable,omitempty"`
	Effects       []Effect      `json:"effects"`
}

type Intent struct {
	Slug        string        `json:"slug"`
	Name        LocalizedText `json:"name"`
	Description LocalizedText `json:"description"`
	Effects     []Effect      `json:"effects"`
}

type Enemy struct {
	Slug        string        `json:"slug"`
	Name        LocalizedText `json:"name"`
	Description LocalizedText `json:"description"`
	Kind        string        `json:"kind"`
	MaxHealth   int           `json:"max_health"`
	ColorTheme  string        `json:"color_theme"`
	ImageURL    string        `json:"image_url"`
	Intents     []Intent      `json:"intents"`
}

type Relic struct {
	Slug        string        `json:"slug"`
	Name        LocalizedText `json:"name"`
	Description LocalizedText `json:"description"`
	Effect      Effect        `json:"effect"`
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
	Slug          string        `json:"slug"`
	Title         LocalizedText `json:"title"`
	Subtitle      LocalizedText `json:"subtitle"`
	CharacterSlug string        `json:"character_slug"`
	Available     bool          `json:"available"`
	BossSlug      string        `json:"boss_slug"`
}

type Bundle struct {
	Version    string       `json:"version"`
	Characters []Character  `json:"characters"`
	Cards      []Card       `json:"cards"`
	Enemies    []Enemy      `json:"enemies"`
	Relics     []Relic      `json:"relics"`
	Events     []Event      `json:"events"`
	Scenes     []StoryScene `json:"scenes"`
	Chapters   []Chapter    `json:"chapters"`
}

type Catalog struct {
	Bundle
	cards      map[string]Card
	enemies    map[string]Enemy
	relics     map[string]Relic
	events     map[string]Event
	scenes     map[string]StoryScene
	chapters   map[string]Chapter
	characters map[string]Character
}

func Load(version string) (*Catalog, error) {
	if version != CurrentVersion {
		return nil, fmt.Errorf("content: unsupported version %q", version)
	}
	contents, err := Files.ReadFile(version + "/bundle.json")
	if err != nil {
		return nil, fmt.Errorf("content: read bundle: %w", err)
	}
	var bundle Bundle
	if err := json.Unmarshal(contents, &bundle); err != nil {
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

func (catalog *Catalog) Card(slug string) (Card, bool) {
	item, ok := catalog.cards[slug]
	return item, ok
}

func (catalog *Catalog) Enemy(slug string) (Enemy, bool) {
	item, ok := catalog.enemies[slug]
	return item, ok
}

func (catalog *Catalog) Relic(slug string) (Relic, bool) {
	item, ok := catalog.relics[slug]
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

func (catalog *Catalog) Character(slug string) (Character, bool) {
	item, ok := catalog.characters[slug]
	return item, ok
}

func (catalog *Catalog) StarterDeck(characterSlug string) []string {
	deck := make([]string, 0, 10)
	for _, card := range catalog.Cards {
		if card.CharacterSlug != characterSlug || card.StarterCopies <= 0 {
			continue
		}
		for range card.StarterCopies {
			deck = append(deck, card.Slug)
		}
	}
	return deck
}

func (catalog *Catalog) RewardCards(characterSlug string) []Card {
	result := make([]Card, 0)
	for _, card := range catalog.Cards {
		if card.CharacterSlug == characterSlug && card.StarterCopies == 0 && card.Rarity != "curse" {
			result = append(result, card)
		}
	}
	return result
}

func (catalog *Catalog) indexAndValidate() error {
	if catalog.Version != CurrentVersion {
		return fmt.Errorf("content: bundle version %q does not match directory %q", catalog.Version, CurrentVersion)
	}
	catalog.cards = make(map[string]Card, len(catalog.Cards))
	catalog.enemies = make(map[string]Enemy, len(catalog.Enemies))
	catalog.relics = make(map[string]Relic, len(catalog.Relics))
	catalog.events = make(map[string]Event, len(catalog.Events))
	catalog.scenes = make(map[string]StoryScene, len(catalog.Scenes))
	catalog.chapters = make(map[string]Chapter, len(catalog.Chapters))
	catalog.characters = make(map[string]Character, len(catalog.Characters))

	for _, character := range catalog.Characters {
		if err := validateLocalized("character "+character.Slug, character.Name, character.Biography, character.Playstyle); err != nil {
			return err
		}
		if character.Slug == "" || character.PortraitURL == "" || character.ModelURL == "" {
			return fmt.Errorf("content: character %q is incomplete", character.Slug)
		}
		if _, exists := catalog.characters[character.Slug]; exists {
			return fmt.Errorf("content: duplicate character %q", character.Slug)
		}
		catalog.characters[character.Slug] = character
	}

	validCardTypes := map[string]bool{"attack": true, "defense": true, "signal": true, "glitch": true}
	validTargets := map[string]bool{"none": true, "self": true, "enemy": true, "all_enemies": true}
	for _, card := range catalog.Cards {
		if err := validateLocalized("card "+card.Slug, card.Name, card.Description); err != nil {
			return err
		}
		if card.Slug == "" || !validCardTypes[card.Type] || !validTargets[card.Target] || card.Cost < 0 || len(card.Effects) == 0 {
			return fmt.Errorf("content: card %q has invalid rules", card.Slug)
		}
		if card.CharacterSlug != "" {
			if _, ok := catalog.characters[card.CharacterSlug]; !ok {
				return fmt.Errorf("content: card %q references unknown character %q", card.Slug, card.CharacterSlug)
			}
		}
		if _, exists := catalog.cards[card.Slug]; exists {
			return fmt.Errorf("content: duplicate card %q", card.Slug)
		}
		catalog.cards[card.Slug] = card
	}

	for _, enemy := range catalog.Enemies {
		if err := validateLocalized("enemy "+enemy.Slug, enemy.Name, enemy.Description); err != nil {
			return err
		}
		if enemy.Slug == "" || enemy.MaxHealth <= 0 || len(enemy.Intents) == 0 {
			return fmt.Errorf("content: enemy %q has invalid rules", enemy.Slug)
		}
		for _, intent := range enemy.Intents {
			if err := validateLocalized("intent "+enemy.Slug+"/"+intent.Slug, intent.Name, intent.Description); err != nil {
				return err
			}
		}
		if _, exists := catalog.enemies[enemy.Slug]; exists {
			return fmt.Errorf("content: duplicate enemy %q", enemy.Slug)
		}
		catalog.enemies[enemy.Slug] = enemy
	}

	for _, relic := range catalog.Relics {
		if err := validateLocalized("relic "+relic.Slug, relic.Name, relic.Description); err != nil {
			return err
		}
		if relic.Slug == "" {
			return errors.New("content: relic slug is required")
		}
		if _, exists := catalog.relics[relic.Slug]; exists {
			return fmt.Errorf("content: duplicate relic %q", relic.Slug)
		}
		catalog.relics[relic.Slug] = relic
	}
	for _, event := range catalog.Events {
		if err := validateLocalized("event "+event.Slug, event.Title, event.Body); err != nil {
			return err
		}
		if event.Slug == "" || len(event.Options) < 2 {
			return fmt.Errorf("content: event %q needs at least two options", event.Slug)
		}
		if _, exists := catalog.events[event.Slug]; exists {
			return fmt.Errorf("content: duplicate event %q", event.Slug)
		}
		optionSlugs := make(map[string]bool, len(event.Options))
		for _, option := range event.Options {
			if err := validateLocalized("event option "+event.Slug+"/"+option.Slug, option.Label, option.Result); err != nil {
				return err
			}
			if option.Slug == "" || optionSlugs[option.Slug] {
				return fmt.Errorf("content: event %q has an invalid or duplicate option %q", event.Slug, option.Slug)
			}
			optionSlugs[option.Slug] = true
			for _, effect := range option.Effects {
				switch effect.Kind {
				case "add_card":
					if _, ok := catalog.cards[effect.Status]; !ok {
						return fmt.Errorf("content: event %q references unknown card %q", event.Slug, effect.Status)
					}
				case "add_relic":
					if _, ok := catalog.relics[effect.Status]; !ok {
						return fmt.Errorf("content: event %q references unknown relic %q", event.Slug, effect.Status)
					}
				case "heal_run", "damage_run":
					if effect.Amount <= 0 {
						return fmt.Errorf("content: event %q has an invalid %s amount", event.Slug, effect.Kind)
					}
				default:
					return fmt.Errorf("content: event %q has unsupported effect %q", event.Slug, effect.Kind)
				}
			}
		}
		catalog.events[event.Slug] = event
	}
	for _, scene := range catalog.Scenes {
		if err := validateLocalized("scene "+scene.Slug, scene.Title); err != nil {
			return err
		}
		if scene.Slug == "" || len(scene.Messages) == 0 || len(scene.Options) == 0 {
			return fmt.Errorf("content: scene %q is incomplete", scene.Slug)
		}
		if _, exists := catalog.scenes[scene.Slug]; exists {
			return fmt.Errorf("content: duplicate scene %q", scene.Slug)
		}
		for _, message := range scene.Messages {
			if err := validateLocalized("scene message "+scene.Slug, message.Text); err != nil {
				return err
			}
		}
		for _, option := range scene.Options {
			if err := validateLocalized("scene option "+scene.Slug+"/"+option.Slug, option.Label); err != nil {
				return err
			}
		}
		catalog.scenes[scene.Slug] = scene
	}
	for _, chapter := range catalog.Chapters {
		if err := validateLocalized("chapter "+chapter.Slug, chapter.Title, chapter.Subtitle); err != nil {
			return err
		}
		if _, ok := catalog.characters[chapter.CharacterSlug]; !ok {
			return fmt.Errorf("content: chapter %q references unknown character", chapter.Slug)
		}
		if _, exists := catalog.chapters[chapter.Slug]; exists {
			return fmt.Errorf("content: duplicate chapter %q", chapter.Slug)
		}
		if chapter.BossSlug != "" {
			if _, ok := catalog.enemies[chapter.BossSlug]; !ok {
				return fmt.Errorf("content: chapter %q references unknown boss", chapter.Slug)
			}
		}
		catalog.chapters[chapter.Slug] = chapter
	}

	if len(catalog.characters) != 7 {
		return fmt.Errorf("content: expected seven story characters, got %d", len(catalog.characters))
	}
	if len(catalog.StarterDeck("nana7mi")) != 10 {
		return fmt.Errorf("content: nana7mi starter deck must contain ten cards")
	}
	return nil
}

func validateLocalized(label string, values ...LocalizedText) error {
	for _, value := range values {
		if strings.TrimSpace(value.ZHCN) == "" || strings.TrimSpace(value.EN) == "" {
			return fmt.Errorf("content: %s is missing a translation", label)
		}
	}
	return nil
}
