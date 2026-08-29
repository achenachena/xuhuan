package progression

import (
	"slices"
	"sort"

	gamecontent "github.com/achenachena/xuhuan/apps/api/internal/content"
)

const (
	CharacterUnlock     = "character"
	ModuleUnlock        = "module"
	PluginUnlock        = "plugin"
	StarterModuleUnlock = "starter_module"
)

type UnlockGrant struct {
	Type        string
	ContentSlug string
}

var starterModules = map[string]string{
	"nana7mi":  "route-needle",
	"jiaran":   "cheer-counter",
	"xiangwan": "afterimage-driver",
	"bella":    "perfect-beat",
	"lulu":     "syntax-error",
	"xingtong": "prism-stance",
	"nailu":    "memory-seed",
}

// InitialUnlocks is the complete horizontal pool available before the first
// Run. Shared content and Nana's authored content provide all four archetypes,
// while one starter module gives the first build a clear route identity.
func InitialUnlocks(catalog *gamecontent.Catalog) []UnlockGrant {
	return characterUnlocks(catalog, "nana7mi", true)
}

// ChapterClearUnlocks returns the next character and their authored reward
// pool. The repository applies this set in the same transaction as the clear.
func ChapterClearUnlocks(catalog *gamecontent.Catalog, characterSlug string) []UnlockGrant {
	if characterSlug == "" {
		return nil
	}
	if _, exists := catalog.Character(characterSlug); !exists {
		return nil
	}
	return characterUnlocks(catalog, characterSlug, false)
}

func characterUnlocks(catalog *gamecontent.Catalog, characterSlug string, includeShared bool) []UnlockGrant {
	grants := []UnlockGrant{{Type: CharacterUnlock, ContentSlug: characterSlug}}
	for _, module := range catalog.Modules {
		if module.CharacterSlug == characterSlug || (includeShared && module.CharacterSlug == "") {
			grants = append(grants, UnlockGrant{Type: ModuleUnlock, ContentSlug: module.Slug})
		}
	}
	for _, plugin := range catalog.Plugins {
		if plugin.CharacterSlug == characterSlug || (includeShared && plugin.CharacterSlug == "") {
			grants = append(grants, UnlockGrant{Type: PluginUnlock, ContentSlug: plugin.Slug})
		}
	}
	if starter := starterModules[characterSlug]; starter != "" {
		grants = append(grants, UnlockGrant{Type: StarterModuleUnlock, ContentSlug: starter})
	}
	sort.Slice(grants, func(i, j int) bool {
		if grants[i].Type == grants[j].Type {
			return grants[i].ContentSlug < grants[j].ContentSlug
		}
		return grants[i].Type < grants[j].Type
	})
	return grants
}

// RewardUnlocks resolves persisted unlock rows into the immutable pool frozen
// into a new Run. Invalid or cross-character rows are ignored defensively.
func RewardUnlocks(progress Progress, catalog *gamecontent.Catalog, characterSlug string) (modules, plugins []string) {
	modules = make([]string, 0)
	plugins = make([]string, 0)
	for _, unlock := range progress.Unlocks {
		switch unlock.Type {
		case ModuleUnlock:
			module, ok := catalog.Module(unlock.ContentSlug)
			if ok && (module.CharacterSlug == "" || module.CharacterSlug == characterSlug) {
				modules = append(modules, module.Slug)
			}
		case PluginUnlock:
			plugin, ok := catalog.Plugin(unlock.ContentSlug)
			if ok && (plugin.CharacterSlug == "" || plugin.CharacterSlug == characterSlug) {
				plugins = append(plugins, plugin.Slug)
			}
		}
	}
	sort.Strings(modules)
	sort.Strings(plugins)
	modules = slices.Compact(modules)
	plugins = slices.Compact(plugins)
	return modules, plugins
}

func StarterModule(progress Progress, catalog *gamecontent.Catalog, characterSlug string) string {
	starter := starterModules[characterSlug]
	if starter == "" || !HasUnlock(progress, StarterModuleUnlock, starter) || !HasUnlock(progress, ModuleUnlock, starter) {
		return ""
	}
	module, ok := catalog.Module(starter)
	if !ok || (module.CharacterSlug != "" && module.CharacterSlug != characterSlug) {
		return ""
	}
	return starter
}
