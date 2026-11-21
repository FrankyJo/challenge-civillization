import type { DomainEvent } from "@civ/contracts";
import { LedgerScript } from "@civ/testing";
import { describe, expect, it } from "vitest";
import { reduceWorldStatus } from "./world-status.js";

describe("reduceWorldStatus", () => {
  const script = new LedgerScript({ worldId: "wld_reducer1" });
  const events: DomainEvent[] = [];
  for (const make of [
    () => script.advance(400),
    () => script.pause(),
    () => script.resume(),
    () => script.advance(10),
  ]) {
    const step = make();
    events.push(...step.outcome.events);
    script.commit(step);
  }

  it("follows the clock and status through world events", () => {
    expect(reduceWorldStatus(null, events)).toEqual({
      worldId: "wld_reducer1",
      clock: 410,
      year: 2,
      dayOfYear: 46,
      status: "running",
      eventPosition: 4,
      lastEventId: events[3]?.eventId,
    });
    expect(reduceWorldStatus(null, events.slice(0, 2))).toMatchObject({
      clock: 400,
      status: "paused",
      eventPosition: 2,
    });
  });

  it("is incremental: folding in batches equals folding at once", () => {
    const first = reduceWorldStatus(null, events.slice(0, 1));
    expect(reduceWorldStatus(reduceWorldStatus(first, events.slice(1, 3)), events.slice(3))).toEqual(
      reduceWorldStatus(null, events),
    );
  });

  it("refuses gaps, replays and foreign events", () => {
    const first = reduceWorldStatus(null, events.slice(0, 1));
    expect(() => reduceWorldStatus(first, events.slice(2))).toThrow(/expected sequence 1/);
    expect(() => reduceWorldStatus(first, events.slice(0, 1))).toThrow(/expected sequence 1/);
    expect(() => reduceWorldStatus({ ...first, worldId: "wld_other001" }, events.slice(1))).toThrow(/another world/);
    expect(() => reduceWorldStatus(null, [])).toThrow(/at least one event/);
  });
});
