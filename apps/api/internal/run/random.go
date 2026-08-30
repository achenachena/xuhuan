package run

type randomStream struct {
	seed        string
	cursor      uint64
	seedValue   uint64
	initialized bool
}

func (stream *randomStream) Uint64() uint64 {
	if !stream.initialized {
		stream.seedValue = foldSeed(stream.seed)
		stream.initialized = true
	}
	// SplitMix64 supports direct cursor-based replay, so only the small cursor
	// needs to be persisted with a Run.
	value := stream.seedValue + (stream.cursor+1)*0x9e3779b97f4a7c15
	stream.cursor++
	value = (value ^ (value >> 30)) * 0xbf58476d1ce4e5b9
	value = (value ^ (value >> 27)) * 0x94d049bb133111eb
	return value ^ (value >> 31)
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

func foldSeed(value string) uint64 {
	seed := uint64(14695981039346656037)
	for index := 0; index < len(value); index++ {
		seed ^= uint64(value[index])
		seed *= 1099511628211
	}
	return seed
}
