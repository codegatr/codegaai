"use strict";

const {
  profileDevice,
  recommendModelSet,
  modelForTask,
} = require("../device-model-policy");

describe("device-model-policy", () => {
  test("reserves operating-system memory on constrained CPU devices", () => {
    const profile = profileDevice({ ramGb: 8, vramGb: null, cores: 4 });
    expect(profile.tier).toBe("constrained");
    expect(profile.cpuBudgetGb).toBeLessThan(4);
  });

  test("recommends stronger role models only when hardware budget fits", () => {
    const low = recommendModelSet({ ramGb: 8, vramGb: null, cores: 4 });
    const high = recommendModelSet({ ramGb: 64, vramGb: 24, cores: 16 });
    expect(low.recommended.chat).toBe("qwen3.5:2b");
    expect(low.recommended.code).toBe("qwen2.5-coder:3b");
    expect(high.recommended.chat).toBe("qwen3.5:9b");
    expect(high.recommended.analysis).toBe("qwen3.6:27b");
    expect(modelForTask("code", high.recommended)).toBe("qwen2.5-coder:7b");
  });
});
