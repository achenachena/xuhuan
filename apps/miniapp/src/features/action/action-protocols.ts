import type {
  SignalProtocol,
  SignalType,
} from "@/features/action/action-types";

export const weaveProtocol = (
  weave: readonly SignalType[],
): SignalProtocol => {
  const surge = weave.filter((signal) => signal === "surge").length;
  const guard = weave.filter((signal) => signal === "guard").length;
  const echo = weave.filter((signal) => signal === "echo").length;
  if (surge === 1 && guard === 1 && echo === 1) return "resonance";
  if (surge >= 2) return "surge_break";
  if (guard >= 2) return "guard_aegis";
  return "echo_replay";
};
