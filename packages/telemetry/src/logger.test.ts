import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger } from "./logger.js";
import { resolveCorrelationId, withCorrelationId, getCorrelationId } from "./correlation.js";

function capture() {
  const lines: Record<string, unknown>[] = [];
  const destination = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(JSON.parse(chunk.toString("utf8")) as Record<string, unknown>);
      callback();
    },
  });
  return { lines, destination };
}

describe("createLogger", () => {
  it("emits JSON with service, level and ISO time", () => {
    const { lines, destination } = capture();
    createLogger({ service: "api", destination }).info({ port: 3000 }, "listening");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ service: "api", level: 30, msg: "listening", port: 3000 });
    expect(String(lines[0]?.["time"])).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("redacts secrets", () => {
    const { lines, destination } = capture();
    createLogger({ service: "api", destination }).info(
      {
        password: "p1",
        db: { connectionString: "postgres://u:p@h/d" },
        req: { headers: { authorization: "Bearer x" } },
      },
      "boot",
    );
    const text = JSON.stringify(lines[0]);
    expect(text).not.toContain("p1");
    expect(text).not.toContain("postgres://u:p@h/d");
    expect(text).not.toContain("Bearer x");
  });

  it("attaches the ambient correlation ID", () => {
    const { lines, destination } = capture();
    const logger = createLogger({ service: "worker", destination });
    withCorrelationId("corr-1", () => logger.info("inside"));
    logger.info("outside");
    expect(lines[0]?.["correlationId"]).toBe("corr-1");
    expect(lines[1]).not.toHaveProperty("correlationId");
  });
});

describe("correlation IDs", () => {
  it("keeps safe inbound IDs and replaces unsafe ones", () => {
    expect(resolveCorrelationId("req-42")).toBe("req-42");
    expect(resolveCorrelationId("bad id\nwith newline")).toMatch(/^[0-9a-f-]{36}$/);
    expect(resolveCorrelationId("x".repeat(129))).toMatch(/^[0-9a-f-]{36}$/);
    expect(resolveCorrelationId(undefined)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("propagates across awaits", async () => {
    await withCorrelationId("async-1", async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      expect(getCorrelationId()).toBe("async-1");
    });
  });
});
