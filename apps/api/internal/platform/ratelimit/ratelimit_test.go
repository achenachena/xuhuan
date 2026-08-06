package ratelimit

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"os"
	"sync"
	"testing"
	"time"
)

type failingLimiter struct{}

func (failingLimiter) Allow(context.Context, string, Policy) (Decision, error) {
	return Decision{}, errors.New("Redis unavailable")
}

func TestMemoryLimiterAndWindowReset(t *testing.T) {
	t.Parallel()
	clock := time.Date(2026, 8, 6, 12, 0, 0, 0, time.UTC)
	limiter := NewMemory(100)
	limiter.now = func() time.Time { return clock }
	policy := Policy{Limit: 2, Window: time.Minute}

	for request := range 3 {
		decision, err := limiter.Allow(context.Background(), "player", policy)
		if err != nil {
			t.Fatal(err)
		}
		if decision.Allowed != (request < 2) {
			t.Fatalf("request %d allowed=%t", request, decision.Allowed)
		}
	}
	clock = clock.Add(time.Minute)
	decision, _ := limiter.Allow(context.Background(), "player", policy)
	if !decision.Allowed || decision.Remaining != 1 {
		t.Fatalf("reset decision=%#v", decision)
	}
}

func TestResilientLimiterFallsBackWithoutLosingProtection(t *testing.T) {
	t.Parallel()
	limiter := NewResilient(
		failingLimiter{},
		NewMemory(100),
		slog.New(slog.NewTextHandler(io.Discard, nil)),
	)
	policy := Policy{Limit: 1, Window: time.Minute}
	first, err := limiter.Allow(context.Background(), "player", policy)
	if err != nil || !first.Allowed {
		t.Fatalf("first=%#v error=%v", first, err)
	}
	second, err := limiter.Allow(context.Background(), "player", policy)
	if err != nil || second.Allowed {
		t.Fatalf("second=%#v error=%v", second, err)
	}
}

func TestResilientLimiterHandlesUnconfiguredTypedRedis(t *testing.T) {
	t.Parallel()
	var primary *RedisLimiter
	limiter := NewResilient(primary, NewMemory(100), slog.New(slog.NewTextHandler(io.Discard, nil)))
	decision, err := limiter.Allow(context.Background(), "player", Policy{Limit: 1, Window: time.Minute})
	if err != nil || !decision.Allowed {
		t.Fatalf("decision=%#v error=%v", decision, err)
	}
}

func TestRedisLimiterIsAtomic(t *testing.T) {
	redisURL := os.Getenv("TEST_REDIS_URL")
	if redisURL == "" {
		t.Skip("TEST_REDIS_URL is not set")
	}
	limiter, err := NewRedis(redisURL, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	defer limiter.Close()

	policy := Policy{Limit: 10, Window: time.Minute}
	key := Key("test", time.Now().String())
	var waitGroup sync.WaitGroup
	decisions := make(chan Decision, 20)
	for range 20 {
		waitGroup.Add(1)
		go func() {
			defer waitGroup.Done()
			decision, err := limiter.Allow(context.Background(), key, policy)
			if err != nil {
				t.Errorf("Allow() error=%v", err)
				return
			}
			decisions <- decision
		}()
	}
	waitGroup.Wait()
	close(decisions)
	allowed := 0
	for decision := range decisions {
		if decision.Allowed {
			allowed++
		}
	}
	if allowed != 10 {
		t.Fatalf("allowed=%d, want 10", allowed)
	}
}
