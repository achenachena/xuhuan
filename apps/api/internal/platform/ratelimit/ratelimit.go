package ratelimit

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"log/slog"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

type Policy struct {
	Limit  int64
	Window time.Duration
}

type Decision struct {
	Allowed    bool
	Remaining  int64
	RetryAfter time.Duration
}

type Limiter interface {
	Allow(context.Context, string, Policy) (Decision, error)
}

type RedisLimiter struct {
	client redis.UniversalClient
}

var fixedWindowScript = redis.NewScript(`
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return {count, ttl}
`)

var ErrInvalidRedisURL = errors.New("invalid Redis URL")

func NewRedis(rawURL string, timeout time.Duration) (*RedisLimiter, error) {
	options, err := redis.ParseURL(rawURL)
	if err != nil {
		return nil, ErrInvalidRedisURL
	}
	options.DialTimeout = timeout
	options.ReadTimeout = timeout
	options.WriteTimeout = timeout
	options.MaxRetries = 0
	return &RedisLimiter{client: redis.NewClient(options)}, nil
}

func (limiter *RedisLimiter) Allow(ctx context.Context, key string, policy Policy) (Decision, error) {
	if limiter == nil || limiter.client == nil {
		return Decision{}, errors.New("Redis rate limiter is unavailable")
	}
	values, err := fixedWindowScript.Run(ctx, limiter.client, []string{key}, policy.Window.Milliseconds()).Int64Slice()
	if err != nil {
		return Decision{}, err
	}
	if len(values) != 2 {
		return Decision{}, errors.New("unexpected Redis rate-limit response")
	}
	count := values[0]
	remaining := max(policy.Limit-count, 0)
	retryAfter := max(time.Duration(values[1])*time.Millisecond, time.Second)
	return Decision{Allowed: count <= policy.Limit, Remaining: remaining, RetryAfter: retryAfter}, nil
}

func (limiter *RedisLimiter) Close() error {
	if limiter == nil || limiter.client == nil {
		return nil
	}
	return limiter.client.Close()
}

type memoryEntry struct {
	count     int64
	expiresAt time.Time
}

type MemoryLimiter struct {
	mu         sync.Mutex
	entries    map[string]memoryEntry
	maxEntries int
	now        func() time.Time
}

func NewMemory(maxEntries int) *MemoryLimiter {
	return &MemoryLimiter{entries: make(map[string]memoryEntry), maxEntries: maxEntries, now: time.Now}
}

func (limiter *MemoryLimiter) Allow(_ context.Context, key string, policy Policy) (Decision, error) {
	limiter.mu.Lock()
	defer limiter.mu.Unlock()

	now := limiter.now()
	entry, exists := limiter.entries[key]
	if !exists || !now.Before(entry.expiresAt) {
		if !exists && len(limiter.entries) >= limiter.maxEntries {
			limiter.removeExpired(now)
		}
		entry = memoryEntry{expiresAt: now.Add(policy.Window)}
	}
	entry.count++
	limiter.entries[key] = entry
	return Decision{
		Allowed:    entry.count <= policy.Limit,
		Remaining:  max(policy.Limit-entry.count, 0),
		RetryAfter: max(entry.expiresAt.Sub(now), time.Second),
	}, nil
}

func (limiter *MemoryLimiter) removeExpired(now time.Time) {
	for key, entry := range limiter.entries {
		if !now.Before(entry.expiresAt) {
			delete(limiter.entries, key)
		}
	}
	if len(limiter.entries) < limiter.maxEntries {
		return
	}
	for key := range limiter.entries {
		delete(limiter.entries, key)
		break
	}
}

type ResilientLimiter struct {
	primary  Limiter
	fallback Limiter
	logger   *slog.Logger
	mu       sync.Mutex
	lastLog  time.Time
}

func NewResilient(primary, fallback Limiter, logger *slog.Logger) *ResilientLimiter {
	return &ResilientLimiter{primary: primary, fallback: fallback, logger: logger}
}

func (limiter *ResilientLimiter) Allow(ctx context.Context, key string, policy Policy) (Decision, error) {
	if limiter.primary != nil {
		decision, err := limiter.primary.Allow(ctx, key, policy)
		if err == nil {
			return decision, nil
		}
		limiter.logFallback(ctx)
	}
	return limiter.fallback.Allow(ctx, key, policy)
}

func (limiter *ResilientLimiter) logFallback(ctx context.Context) {
	limiter.mu.Lock()
	defer limiter.mu.Unlock()
	if time.Since(limiter.lastLog) < time.Minute {
		return
	}
	limiter.lastLog = time.Now()
	limiter.logger.WarnContext(ctx, "redis_rate_limit_unavailable", "fallback", "in_memory")
}

func Key(scope, identifier string) string {
	sum := sha256.Sum256([]byte(identifier))
	return "xuhuan:rate:" + scope + ":" + hex.EncodeToString(sum[:])
}
