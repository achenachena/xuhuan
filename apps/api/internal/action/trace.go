package action

import "encoding/base64"

func DecodeTrace(trace InputTrace, maxTicks int) ([]InputFrame, error) {
	if trace.Encoding != TraceEncodingRLE || trace.Ticks <= 0 || trace.Ticks > maxTicks {
		return nil, ErrInvalidTrace
	}
	raw, err := base64.RawURLEncoding.Strict().DecodeString(trace.Data)
	if err != nil || len(raw) == 0 || len(raw)%2 != 0 {
		return nil, ErrInvalidTrace
	}
	frames := make([]InputFrame, 0, trace.Ticks)
	for index := 0; index < len(raw); index += 2 {
		control, count := raw[index], int(raw[index+1])
		if control&0x80 != 0 || count == 0 || len(frames)+count > trace.Ticks {
			return nil, ErrInvalidTrace
		}
		if index >= 2 && raw[index-2] == control && raw[index-1] != 255 {
			return nil, ErrInvalidTrace
		}
		frame := InputFrame{
			Direction: control & 0x0f,
			Magnitude: (control >> 4) & 0x03,
			Skill:     control&0x40 != 0,
		}
		for range count {
			frames = append(frames, frame)
		}
	}
	if len(frames) != trace.Ticks {
		return nil, ErrInvalidTrace
	}
	return frames, nil
}
