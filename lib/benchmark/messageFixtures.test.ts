import { describe, expect, it } from "vitest";
import {
  createMessageFixture,
  MESSAGE_BENCHMARK_KINDS,
} from "@/lib/benchmark/messageFixtures";

describe("createMessageFixture", () => {
  it("同一配置始终生成相同的数据和指纹", () => {
    const first = createMessageFixture({
      count: 100,
      scenario: "mixed",
      seed: 20260909,
    });
    const second = createMessageFixture({
      count: 100,
      scenario: "mixed",
      seed: 20260909,
    });

    expect(first).toEqual(second);
    expect(first.summary.fingerprint).toBe("fnv1a-f09b9657");
  });

  it("较小数据集是较大数据集的前缀", () => {
    const small = createMessageFixture({ count: 100, scenario: "mixed", seed: 7 });
    const large = createMessageFixture({ count: 1_000, scenario: "mixed", seed: 7 });

    expect(large.messages.slice(0, 100)).toEqual(small.messages);
  });

  it("每个完整的 100 条周期都遵守场景比例", () => {
    const fixture = createMessageFixture({
      count: 100,
      scenario: "mixed",
      seed: 7,
    });

    expect(fixture.summary.kindCounts).toMatchObject({
      "short-text": 50,
      "long-text": 20,
      markdown: 15,
      code: 10,
      table: 5,
    });
  });

  it("所有场景种类的计数都有确定的初始值", () => {
    const fixture = createMessageFixture({ count: 10, scenario: "short-text" });

    for (const kind of MESSAGE_BENCHMARK_KINDS) {
      expect(fixture.summary.kindCounts[kind]).toBeTypeOf("number");
    }
  });

  it("拒绝无效的数量和种子", () => {
    expect(() => createMessageFixture({ count: -1 })).toThrow(RangeError);
    expect(() => createMessageFixture({ count: 1, seed: 1.5 })).toThrow(RangeError);
  });
});
