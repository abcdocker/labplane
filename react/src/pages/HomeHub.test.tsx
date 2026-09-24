// @vitest-environment jsdom
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import HomeHub from "./HomeHub";

vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({ status: { loggedIn: true, role: "admin" } }),
}));

vi.mock("@/hooks/use-runtime-status", () => ({
  useRuntimeStatusQuery: () => ({
    isLoading: false,
    data: {
      config: {
        k8sConfigured: true,
        vcenterConfigured: true,
        hasBaotaApiKey: true,
        baotaUrl: "https://panel.example.com",
      },
      systemCheck: { baota: { status: "success" } },
    },
  }),
}));

vi.mock("@/lib/api", () => ({
  apiGetJson: vi.fn(async (url: string) => {
    if (url === "/api/k8s/summary")
      return {
        nodeCount: 3,
        namespaceCount: 8,
        podCount: 21,
        serviceCount: 12,
      };
    if (url === "/api/vcenter/vms") return { vms: [] };
    if (url === "/api/vcenter/hosts") return { hosts: [] };
    if (url === "/api/vcenter/bastion/vms") return { vms: [], extraHosts: [] };
    if (url === "/api/app-center/redis/status")
      return {
        mysqlReachable: true,
        encryptionReady: true,
        mirrorRedisOk: true,
      };
    if (url.includes("/instances")) return { instances: [] };
    if (url === "/api/dns/domains") return { domains: [] };
    if (url === "/api/ops/alerts") return { rules: [], channels: [] };
    if (url === "/api/ops/inspect/reports") return { reports: [] };
    if (url === "/api/ops/monitoring/panels") return { panels: [] };
    if (url === "/api/prometheus/status") return { scopes: {} };
    if (url === "/api/ops/mesh/summary") return { instances: [] };
    if (url === "/api/ops/authentik/summary") return { instances: [] };
    if (url === "/api/k8s/gwapi/status") return { available: true, version: "v1" };
    throw new Error(`unexpected request: ${url}`);
  }),
}));

afterEach(cleanup);

describe("HomeHub responsive workspace cards", () => {
  it("exposes the adaptive card collection as one semantic list", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <HomeHub />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const cardList = screen.getByRole("list", { name: "工作区模块" });
    expect(cardList).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(8);
    expect(
      screen.getByRole("link", { name: /Kubernetes/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Gateway API/ })).toHaveAttribute(
      "href",
      "/cluster/routes",
    );
    expect(screen.queryByRole("link", { name: /宝塔/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Authentik/ })).toBeInTheDocument();
  });
});
