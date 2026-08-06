package seeddata

import "embed"

// Files contains deterministic catalog data. It never contains player or battle data.
//
//go:embed *.json
var Files embed.FS
