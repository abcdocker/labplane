import { describe, expect, it } from "vitest";

import { workspaceFromPathname } from "./workspace";

describe("workspaceFromPathname", () => {
  it("treats legacy Baota URLs as Kubernetes while they redirect to route management", () => {
    expect(workspaceFromPathname("/cluster/baota/sync")).toBe("kubernetes");
  });
});
