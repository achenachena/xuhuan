package postgres

import "testing"

func TestServerlessPoolConfigSupportsNeonConnectionString(t *testing.T) {
	t.Parallel()

	config, err := serverlessPoolConfig(
		"postgresql://xuhuan_owner:secret@example-pooler.us-east-1.aws.neon.tech/xuhuan?sslmode=require&channel_binding=require",
	)
	if err != nil {
		t.Fatalf("serverlessPoolConfig() error = %v", err)
	}
	if config.MaxConns != 4 {
		t.Fatalf("MaxConns = %d, want 4", config.MaxConns)
	}
	if config.MinConns != 0 {
		t.Fatalf("MinConns = %d, want 0", config.MinConns)
	}
	if config.ConnConfig.Config.ChannelBinding != "require" {
		t.Fatalf("channel_binding = %q", config.ConnConfig.Config.ChannelBinding)
	}
}
