import { describe, expect, it } from "vitest";
import { inspectionDomainReportURL, INSPECTION_DOMAINS } from "./inspectionDomains";

describe("inspection domains", () => {
  it("exposes the four infrastructure domains", () => {
    expect(INSPECTION_DOMAINS.map((item) => item.id)).toEqual(["vcenter", "bastion", "headscale", "authentik"]);
  });

  it("builds an encoded, paged report URL", () => {
    expect(inspectionDomainReportURL("headscale", 15, 15)).toBe(
      "/api/ops/inspect/reports?domain=headscale&offset=15&limit=15"
    );
  });
});
