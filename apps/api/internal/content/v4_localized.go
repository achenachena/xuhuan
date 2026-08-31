package content

type V4LocalizedBundle struct {
	Version     string                  `json:"version"`
	Protocol    string                  `json:"protocol"`
	Locale      string                  `json:"locale"`
	Rules       V4Rules                 `json:"rules"`
	ShowEffects []V4LocalizedShowEffect `json:"show_effects"`
	Characters  []V4LocalizedCharacter  `json:"characters"`
	Companions  []V4LocalizedCompanion  `json:"companions"`
	Enemies     []V4LocalizedEnemy      `json:"enemies"`
	Chapters    []V4LocalizedChapter    `json:"chapters"`
	Daily       V4LocalizedDaily        `json:"daily"`
}

type V4LocalizedShowEffect struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Archetype   string `json:"archetype"`
	Behavior    string `json:"behavior"`
	Amount      int    `json:"amount"`
}

type V4LocalizedSpecial struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Description   string `json:"description"`
	ChargeCost    int    `json:"charge_cost"`
	Behavior      string `json:"behavior"`
	Power         int    `json:"power"`
	DurationTicks int    `json:"duration_ticks"`
}

type V4LocalizedCharacter struct {
	ID          string             `json:"id"`
	Name        string             `json:"name"`
	Biography   string             `json:"biography"`
	Playstyle   string             `json:"playstyle"`
	ColorTheme  string             `json:"color_theme"`
	PortraitURL string             `json:"portrait_url"`
	SpriteURL   string             `json:"sprite_url"`
	BaseStats   V4PlayerStats      `json:"base_stats"`
	Special     V4LocalizedSpecial `json:"special"`
}

type V4LocalizedCompanion struct {
	ID          string   `json:"id"`
	CharacterID string   `json:"character_id"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	PortraitURL string   `json:"portrait_url"`
	Assist      V4Assist `json:"assist"`
}

type V4LocalizedEnemy struct {
	ID               string   `json:"id"`
	Name             string   `json:"name"`
	Description      string   `json:"description"`
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

type V4LocalizedBubble struct {
	SenderID string `json:"sender_id"`
	Sender   string `json:"sender"`
	Text     string `json:"text"`
}

type V4LocalizedStoryChoice struct {
	ID           string `json:"id"`
	Label        string `json:"label"`
	Result       string `json:"result"`
	Tag          string `json:"tag"`
	ShowEffectID string `json:"show_effect_id,omitempty"`
}

type V4LocalizedIntermission struct {
	AfterSegment int                      `json:"after_segment"`
	Prompt       string                   `json:"prompt"`
	Messages     []V4LocalizedBubble      `json:"messages"`
	Choices      []V4LocalizedStoryChoice `json:"choices"`
}

type V4LocalizedStory struct {
	Prelude      []V4LocalizedBubble     `json:"prelude"`
	Intermission V4LocalizedIntermission `json:"intermission"`
	Epilogue     []V4LocalizedBubble     `json:"epilogue"`
	ReplayRecap  []V4LocalizedBubble     `json:"replay_recap"`
}

type V4LocalizedEncoreModifier struct {
	ID                          string `json:"id"`
	Name                        string `json:"name"`
	Description                 string `json:"description"`
	EnemySpeedPercent           int    `json:"enemy_speed_percent"`
	ProjectileSpeedPercent      int    `json:"projectile_speed_percent"`
	SpecialChargePenaltyPercent int    `json:"special_charge_penalty_percent"`
}

type V4LocalizedEnding struct {
	ID       string              `json:"id"`
	Title    string              `json:"title"`
	Summary  string              `json:"summary"`
	Messages []V4LocalizedBubble `json:"messages"`
}

type V4LocalizedBoss struct {
	ID            string        `json:"id"`
	Name          string        `json:"name"`
	Description   string        `json:"description"`
	SpriteURL     string        `json:"sprite_url"`
	MaxHealth     int           `json:"max_health"`
	DurationTicks int           `json:"duration_ticks"`
	Stages        []V4BossStage `json:"stages"`
}

type V4LocalizedChapter struct {
	ID                string                      `json:"id"`
	Order             int                         `json:"order"`
	Title             string                      `json:"title"`
	Subtitle          string                      `json:"subtitle"`
	FeaturedCharacter string                      `json:"featured_character"`
	UnlockCompanion   string                      `json:"unlock_companion"`
	BackgroundURL     string                      `json:"background_url"`
	Segments          []V4Segment                 `json:"segments"`
	Waves             []V4Wave                    `json:"waves"`
	Boss              V4LocalizedBoss             `json:"boss"`
	Story             V4LocalizedStory            `json:"story"`
	Encore            []V4LocalizedEncoreModifier `json:"encore"`
	Endings           []V4LocalizedEnding         `json:"endings"`
}

type V4LocalizedDaily struct {
	ID                   string   `json:"id"`
	Title                string   `json:"title"`
	Subtitle             string   `json:"subtitle"`
	SeedTimezone         string   `json:"seed_timezone"`
	SegmentDurationTicks int      `json:"segment_duration_ticks"`
	SegmentCount         int      `json:"segment_count"`
	ShowChoiceCount      int      `json:"show_choice_count"`
	RotationCharacters   []string `json:"rotation_characters"`
	WaveIDs              []string `json:"wave_ids"`
	BossIDs              []string `json:"boss_ids"`
	EncoreModifierIDs    []string `json:"encore_modifier_ids"`
}

func (catalog *V4Catalog) Localized(locale string) V4LocalizedBundle {
	if _, ok := catalog.Locales[locale]; !ok {
		locale = catalog.Manifest.DefaultLocale
	}
	bundle := V4LocalizedBundle{
		Version:     catalog.ContentVersion,
		Protocol:    catalog.Protocol,
		Locale:      locale,
		Rules:       catalog.Rules,
		ShowEffects: make([]V4LocalizedShowEffect, 0, len(catalog.ShowEffects)),
		Characters:  make([]V4LocalizedCharacter, 0, len(catalog.Characters)),
		Companions:  make([]V4LocalizedCompanion, 0, len(catalog.Companions)),
		Enemies:     make([]V4LocalizedEnemy, 0, len(catalog.Enemies)),
		Chapters:    make([]V4LocalizedChapter, 0, len(catalog.Chapters)),
	}
	for _, item := range catalog.ShowEffects {
		bundle.ShowEffects = append(bundle.ShowEffects, V4LocalizedShowEffect{ID: item.ID, Name: catalog.Text(locale, item.NameKey), Description: catalog.Text(locale, item.DescriptionKey), Archetype: item.Archetype, Behavior: item.Behavior, Amount: item.Amount})
	}
	for _, item := range catalog.Characters {
		bundle.Characters = append(bundle.Characters, V4LocalizedCharacter{
			ID: item.ID, Name: catalog.Text(locale, item.NameKey), Biography: catalog.Text(locale, item.BiographyKey), Playstyle: catalog.Text(locale, item.PlaystyleKey), ColorTheme: item.ColorTheme,
			PortraitURL: item.PortraitURL, SpriteURL: item.SpriteURL, BaseStats: item.BaseStats,
			Special: V4LocalizedSpecial{ID: item.Special.ID, Name: catalog.Text(locale, item.Special.NameKey), Description: catalog.Text(locale, item.Special.DescriptionKey), ChargeCost: item.Special.ChargeCost, Behavior: item.Special.Behavior, Power: item.Special.Power, DurationTicks: item.Special.DurationTicks},
		})
	}
	for _, item := range catalog.Companions {
		bundle.Companions = append(bundle.Companions, V4LocalizedCompanion{ID: item.ID, CharacterID: item.CharacterID, Name: catalog.Text(locale, item.NameKey), Description: catalog.Text(locale, item.DescriptionKey), PortraitURL: item.PortraitURL, Assist: item.Assist})
	}
	for _, item := range catalog.Enemies {
		bundle.Enemies = append(bundle.Enemies, V4LocalizedEnemy{ID: item.ID, Name: catalog.Text(locale, item.NameKey), Description: catalog.Text(locale, item.DescriptionKey), SpriteURL: item.SpriteURL, MaxHealth: item.MaxHealth, Speed: item.Speed, ContactDamage: item.ContactDamage, MovePattern: item.MovePattern, ShotPattern: item.ShotPattern, ShotInterval: item.ShotInterval, ProjectileSpeed: item.ProjectileSpeed, ProjectileDamage: item.ProjectileDamage, TelegraphTicks: item.TelegraphTicks, Traits: cloneStrings(item.Traits)})
	}
	for _, chapter := range catalog.Chapters {
		bundle.Chapters = append(bundle.Chapters, catalog.localizedChapter(locale, chapter))
	}
	bundle.Daily = V4LocalizedDaily{ID: catalog.Daily.ID, Title: catalog.Text(locale, catalog.Daily.TitleKey), Subtitle: catalog.Text(locale, catalog.Daily.SubtitleKey), SeedTimezone: catalog.Daily.SeedTimezone, SegmentDurationTicks: catalog.Daily.SegmentDurationTicks, SegmentCount: catalog.Daily.SegmentCount, ShowChoiceCount: catalog.Daily.ShowChoiceCount, RotationCharacters: cloneStrings(catalog.Daily.RotationCharacters), WaveIDs: cloneStrings(catalog.Daily.WaveIDs), BossIDs: cloneStrings(catalog.Daily.BossIDs), EncoreModifierIDs: cloneStrings(catalog.Daily.EncoreModifierIDs)}
	return bundle
}

func (catalog *V4Catalog) localizedChapter(locale string, chapter V4Chapter) V4LocalizedChapter {
	localized := V4LocalizedChapter{
		ID: chapter.ID, Order: chapter.Order, Title: catalog.Text(locale, chapter.TitleKey), Subtitle: catalog.Text(locale, chapter.SubtitleKey), FeaturedCharacter: chapter.FeaturedCharacter, UnlockCompanion: chapter.UnlockCompanion, BackgroundURL: chapter.BackgroundURL, Segments: cloneSegments(chapter.Segments), Waves: cloneWaves(chapter.Waves),
		Boss:    V4LocalizedBoss{ID: chapter.Boss.ID, Name: catalog.Text(locale, chapter.Boss.NameKey), Description: catalog.Text(locale, chapter.Boss.DescriptionKey), SpriteURL: chapter.Boss.SpriteURL, MaxHealth: chapter.Boss.MaxHealth, DurationTicks: chapter.Boss.DurationTicks, Stages: cloneBossStages(chapter.Boss.Stages)},
		Story:   V4LocalizedStory{Prelude: catalog.localizedBubbles(locale, chapter.Story.Prelude), Epilogue: catalog.localizedBubbles(locale, chapter.Story.Epilogue), ReplayRecap: catalog.localizedBubbles(locale, chapter.Story.ReplayRecap)},
		Encore:  make([]V4LocalizedEncoreModifier, 0, len(chapter.Encore)),
		Endings: make([]V4LocalizedEnding, 0, len(chapter.Endings)),
	}
	intermission := chapter.Story.Intermission
	localized.Story.Intermission = V4LocalizedIntermission{AfterSegment: intermission.AfterSegment, Prompt: catalog.Text(locale, intermission.PromptKey), Messages: catalog.localizedBubbles(locale, intermission.Messages), Choices: make([]V4LocalizedStoryChoice, 0, len(intermission.Choices))}
	for _, choice := range intermission.Choices {
		localized.Story.Intermission.Choices = append(localized.Story.Intermission.Choices, V4LocalizedStoryChoice{ID: choice.ID, Label: catalog.Text(locale, choice.LabelKey), Result: catalog.Text(locale, choice.ResultKey), Tag: choice.Tag, ShowEffectID: choice.ShowEffectID})
	}
	for _, modifier := range chapter.Encore {
		localized.Encore = append(localized.Encore, V4LocalizedEncoreModifier{ID: modifier.ID, Name: catalog.Text(locale, modifier.NameKey), Description: catalog.Text(locale, modifier.DescriptionKey), EnemySpeedPercent: modifier.EnemySpeedPercent, ProjectileSpeedPercent: modifier.ProjectileSpeedPercent, SpecialChargePenaltyPercent: modifier.SpecialChargePenaltyPercent})
	}
	for _, ending := range chapter.Endings {
		localized.Endings = append(localized.Endings, V4LocalizedEnding{ID: ending.ID, Title: catalog.Text(locale, ending.TitleKey), Summary: catalog.Text(locale, ending.SummaryKey), Messages: catalog.localizedBubbles(locale, ending.Messages)})
	}
	return localized
}

func cloneStrings(values []string) []string {
	result := make([]string, len(values))
	copy(result, values)
	return result
}

func cloneSegments(values []V4Segment) []V4Segment {
	result := make([]V4Segment, len(values))
	copy(result, values)
	return result
}

func cloneBossStages(values []V4BossStage) []V4BossStage {
	result := make([]V4BossStage, len(values))
	copy(result, values)
	return result
}

func cloneWaves(values []V4Wave) []V4Wave {
	result := make([]V4Wave, len(values))
	for index, wave := range values {
		result[index] = wave
		result[index].Spawns = make([]V4Spawn, len(wave.Spawns))
		copy(result[index].Spawns, wave.Spawns)
	}
	return result
}

func (catalog *V4Catalog) localizedBubbles(locale string, bubbles []V4Bubble) []V4LocalizedBubble {
	localized := make([]V4LocalizedBubble, 0, len(bubbles))
	for _, bubble := range bubbles {
		localized = append(localized, V4LocalizedBubble{SenderID: bubble.Sender, Sender: catalog.Text(locale, "sender."+bubble.Sender), Text: catalog.Text(locale, bubble.TextKey)})
	}
	return localized
}
