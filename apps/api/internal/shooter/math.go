package shooter

type randomStream struct{ state uint32 }

func seedFromString(value string) uint32 {
	seed := uint32(2166136261)
	for index := range len(value) {
		seed ^= uint32(value[index])
		seed *= 16777619
	}
	if seed == 0 {
		return 0x9e3779b9
	}
	return seed
}

func (stream *randomStream) next() uint32 {
	if stream.state == 0 {
		stream.state = 0x9e3779b9
	}
	x := stream.state
	x ^= x << 13
	x ^= x >> 17
	x ^= x << 5
	stream.state = x
	return x
}

func (stream *randomStream) intn(limit int) int {
	if limit <= 1 {
		return 0
	}
	return int(stream.next() % uint32(limit))
}

func clamp(value, low, high int) int { return min(high, max(low, value)) }
func square(value int) int           { return value * value }

func integerSqrt(value int) int {
	if value <= 0 {
		return 0
	}
	x := value
	y := (x + 1) / 2
	for y < x {
		x = y
		y = (x + value/x) / 2
	}
	return x
}
