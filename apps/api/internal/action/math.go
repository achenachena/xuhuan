package action

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
func distanceSquared(ax, ay, bx, by int) int { dx, dy := ax-bx, ay-by; return dx*dx + dy*dy }
func nearTravelPath(x, y, startX, startY, midpointX, midpointY, endX, endY, radius int) bool {
	distance := min(
		distanceSquared(x, y, startX, startY),
		distanceSquared(x, y, midpointX, midpointY),
		distanceSquared(x, y, endX, endY),
	)
	return distance <= radius*radius
}
func clamp(value, low, high int) int { return min(high, max(low, value)) }
func boolInt(value bool) uint32 {
	if value {
		return 1
	}
	return 0
}
func stableStringID(value string) uint32 {
	hash := uint32(2166136261)
	for index := 0; index < len(value); index++ {
		hash ^= uint32(value[index])
		hash *= 16777619
	}
	return hash
}
func fnv32(values []uint32) uint32 {
	hash := uint32(2166136261)
	for _, value := range values {
		for shift := uint(0); shift < 32; shift += 8 {
			hash ^= (value >> shift) & 0xff
			hash *= 16777619
		}
	}
	return hash
}
