package shooter

func DecodeTrace(trace InputTrace, exactTicks int) ([]Input, error) {
	if trace.Encoding != TraceEncoding || exactTicks <= 0 || exactTicks > MaxSegmentTicks || trace.Ticks != exactTicks || len(trace.Runs) == 0 || len(trace.Runs) > exactTicks {
		return nil, ErrInvalidTrace
	}
	frames := make([]Input, 0, exactTicks)
	var previous uint8
	for index, run := range trace.Runs {
		control, count := run[0], int(run[1])
		if count <= 0 || count > exactTicks-len(frames) || (index > 0 && control == previous && trace.Runs[index-1][1] != 255) {
			return nil, ErrInvalidTrace
		}
		previous = control
		frame := Input{X: control & 0x7f, Rescue: control&0x80 != 0}
		for range count {
			frames = append(frames, frame)
		}
	}
	if len(frames) != exactTicks {
		return nil, ErrInvalidTrace
	}
	return frames, nil
}
