import { describe, expect, it } from "vitest";

import { buildActionConfig } from "@/features/action/action-types";
import {
  createV3Run,
  v3BaseState,
  v3Content,
} from "@/test/v3-fixtures";

describe("buildActionConfig", () => {
  it("normalizes a nullable hazards collection at the transport edge", () => {
    const run = createV3Run({
      state: {
        ...v3BaseState,
        phase: "encounter",
        encounter: {
          slug: "signal-handshake",
          seed: "transport-boundary",
          kind: "tutorial",
          duration_ticks: 600,
          max_ticks: 900,
          tutorial: true,
          objective: { kind: "recover", target: 3 },
          risk: 1,
          reward_bias: "surge",
          hazards: null as never,
        },
      },
    });

    expect(buildActionConfig(v3Content, run).hazards).toEqual([]);
  });
});
