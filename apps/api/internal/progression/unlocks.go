package progression

const (
	CharacterUnlock  = "character"
	CompanionUnlock  = "companion"
	MemoryClipUnlock = "memory_clip"
)

type UnlockGrant struct {
	Type        string
	ContentSlug string
}

func InitialUnlocks() []UnlockGrant {
	return []UnlockGrant{{Type: CharacterUnlock, ContentSlug: "nana7mi"}}
}
