package migrations

import "embed"

// Files contains the ordered SQL migrations applied by the migration command.
//
//go:embed *.sql
var Files embed.FS
