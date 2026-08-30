package run

import (
	"crypto/sha256"
	"encoding/binary"
)

type randomStream struct {
	seed   string
	cursor uint64
}

func (stream *randomStream) Uint64() uint64 {
	// Hashing (seed, cursor) gives map/reward generation a stable random stream
	// across processes without storing mutable RNG state or exposing a token.
	input := make([]byte, len(stream.seed)+8)
	copy(input, stream.seed)
	binary.BigEndian.PutUint64(input[len(stream.seed):], stream.cursor)
	digest := sha256.Sum256(input)
	stream.cursor++
	return binary.BigEndian.Uint64(digest[:8])
}

func (stream *randomStream) Intn(limit int) int {
	if limit <= 1 {
		if limit == 1 {
			stream.cursor++
		}
		return 0
	}
	return int(stream.Uint64() % uint64(limit))
}
