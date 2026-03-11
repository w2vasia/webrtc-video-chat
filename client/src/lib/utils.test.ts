import { describe, it, expect, vi, afterEach } from "vitest";
import { formatLastSeen } from "./utils";

const NOW = 1_700_000_000; // fixed epoch for deterministic tests

afterEach(() => vi.restoreAllMocks());

function mockNow(ts: number) {
  vi.spyOn(Date, "now").mockReturnValue(ts * 1000);
}

describe("formatLastSeen", () => {
  it("returns 'Offline' for zero timestamp", () => {
    expect(formatLastSeen(0)).toBe("Offline");
  });

  it("returns 'Last seen just now' for less than 60 seconds ago", () => {
    mockNow(NOW);
    expect(formatLastSeen(NOW - 59)).toBe("Last seen just now");
  });

  it("returns minutes for 1–59 minutes ago", () => {
    mockNow(NOW);
    expect(formatLastSeen(NOW - 60)).toBe("Last seen 1m ago");
    expect(formatLastSeen(NOW - 3599)).toBe("Last seen 59m ago");
  });

  it("returns hours for 1–23 hours ago", () => {
    mockNow(NOW);
    expect(formatLastSeen(NOW - 3600)).toBe("Last seen 1h ago");
    expect(formatLastSeen(NOW - 86399)).toBe("Last seen 23h ago");
  });

  it("returns days for 1+ days ago", () => {
    mockNow(NOW);
    expect(formatLastSeen(NOW - 86400)).toBe("Last seen 1d ago");
    expect(formatLastSeen(NOW - 86400 * 7)).toBe("Last seen 7d ago");
  });
});
