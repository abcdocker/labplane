import { describe, expect, it } from "vitest";
import { meshRouteState } from "./meshRoutes";

describe("meshRouteState", () => {
  it("keeps pending routes visible without including them in the approval draft", () => {
    expect(meshRouteState(["192.168.1.0/24"], ["192.168.1.0/24", "192.168.2.0/24"]))
      .toEqual({ approved: ["192.168.1.0/24"], pending: ["192.168.2.0/24"], approvalDraft: "192.168.1.0/24" });
  });
});
