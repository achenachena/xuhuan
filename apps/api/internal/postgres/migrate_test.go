package postgres

import (
	"testing"
	"testing/fstest"
)

func TestReadMigrationsSortsAndValidates(t *testing.T) {
	t.Parallel()

	files := fstest.MapFS{
		"002_second.sql": {Data: []byte("SELECT 2")},
		"001_first.sql":  {Data: []byte("SELECT 1")},
	}
	migrations, err := readMigrations(files)
	if err != nil {
		t.Fatalf("readMigrations() error = %v", err)
	}
	if migrations[0].version != 1 || migrations[1].version != 2 {
		t.Fatalf("migrations = %#v", migrations)
	}
}

func TestReadMigrationsRejectsDuplicateVersions(t *testing.T) {
	t.Parallel()

	_, err := readMigrations(fstest.MapFS{
		"001_first.sql":  {Data: []byte("SELECT 1")},
		"001_second.sql": {Data: []byte("SELECT 2")},
	})
	if err == nil {
		t.Fatal("readMigrations() error = nil")
	}
}
