// @vitest-environment jsdom
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import AuthentikPage from "./AuthentikPage";
import { apiGetJson } from "@/lib/api";

vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({ status: { role: "admin" } }),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    apiGetJson: vi.fn(),
  };
});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const instances = [
  {
    id: "primary",
    name: "主认证中心",
    baseUrl: "https://sso-primary.example.com",
    tokenSet: true,
    enabled: true,
    notes: "",
    createdAt: "2026-09-20T00:00:00Z",
    updatedAt: "2026-09-20T00:00:00Z",
  },
  {
    id: "secondary",
    name: "备用认证中心",
    baseUrl: "https://sso-secondary.example.com",
    tokenSet: true,
    enabled: true,
    notes: "",
    createdAt: "2026-09-21T00:00:00Z",
    updatedAt: "2026-09-21T00:00:00Z",
  },
];

afterEach(cleanup);

describe("AuthentikPage instance routing", () => {
  beforeEach(() => {
    vi.mocked(apiGetJson).mockImplementation(async (url: string) => {
      if (url === "/api/ops/authentik/instances") return { instances };
      if (url.endsWith("/status")) return {
        instance: instances[1],
        healthy: true,
        version: "2026.8.1",
        usersCount: 5,
        groupsCount: 4,
        appsCount: 26,
        providersCount: 14,
        system: { version: "2026.8.1" },
      };
      if (url.includes("/events")) return {
        events: [{
          pk: "event-1",
          created: "2026-09-22T02:52:25Z",
          action: "system_task_exception",
          client_ip: "192.0.2.10",
          user: null,
          app: "authentik.tasks",
          context: {
            message: "Task authentik.outposts.tasks.outpost_connection encountered an error: Outpost connection failed",
            exception: "dial tcp: connection refused",
          },
        }],
      };
      if (url.includes("/users")) return { users: [], groups: [] };
      throw new Error(`unexpected request: ${url}`);
    });
  });

  it("selects the Authentik instance named by the inst query parameter", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/cluster/authentik?inst=secondary"]}>
          <AuthentikPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { level: 2, name: "备用认证中心" })).toBeInTheDocument();
  });

  it("writes the first instance to the URL when no instance is specified", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const LocationProbe = () => <output aria-label="current search">{useLocation().search}</output>;

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/cluster/authentik"]}>
          <AuthentikPage />
          <LocationProbe />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText("current search")).toHaveTextContent("?inst=primary"));
  });

  it("opens the add-instance dialog when new=1 is present", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/cluster/authentik?new=1"]}>
          <AuthentikPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("dialog", { name: "添加 Authentik 实例" })).toBeInTheDocument();
  });

  it("renders dashboard data without duplicate in-page navigation", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/cluster/authentik?inst=secondary"]}>
          <AuthentikPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: "身份系统概览" })).toBeInTheDocument();
    expect(await screen.findByText("26")).toBeInTheDocument();
    expect(screen.getByText("14")).toBeInTheDocument();
    expect(screen.getByText("近期异常")).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByText("认证实例")).not.toBeInTheDocument();
  });

  it("shows task exception details instead of an empty event row", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/cluster/authentik/events?inst=secondary"]}>
          <AuthentikPage initialTab="events" />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/Outpost connection failed/)).toBeInTheDocument();
    expect(screen.getAllByText("authentik.outposts.tasks.outpost_connection")).toHaveLength(2);
    expect(screen.getByText("系统")).toBeInTheDocument();
    expect(screen.getByText("192.0.2.10")).toBeInTheDocument();
    expect(screen.getByText("dial tcp: connection refused")).toBeInTheDocument();
  });

  it("keeps the dashboard useful when the event feed cannot be loaded", async () => {
    vi.mocked(apiGetJson).mockImplementation(async (url: string) => {
      if (url === "/api/ops/authentik/instances") return { instances };
      if (url.endsWith("/status")) return {
        instance: instances[1],
        healthy: true,
        usersCount: 5,
        groupsCount: 4,
        appsCount: 26,
        providersCount: 14,
      };
      if (url.includes("/events")) throw new Error("event API unavailable");
      throw new Error(`unexpected request: ${url}`);
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/cluster/authentik?inst=secondary"]}>
          <AuthentikPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/近期事件加载失败/)).toBeInTheDocument();
    expect(screen.getByText("26")).toBeInTheDocument();
  });

  it("returns to the first instance when inst is removed after mount", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const HistoryDriver = () => {
      const navigate = useNavigate();
      return <button onClick={() => navigate("/cluster/authentik")}>clear instance</button>;
    };

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/cluster/authentik?inst=secondary"]}>
          <AuthentikPage />
          <HistoryDriver />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { level: 2, name: "备用认证中心" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "clear instance" }));
    expect(await screen.findByRole("heading", { level: 2, name: "主认证中心" })).toBeInTheDocument();
  });

  it("repairs an invalid inst introduced after mount", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const HistoryDriver = () => {
      const navigate = useNavigate();
      const location = useLocation();
      return (
        <>
          <button onClick={() => navigate("/cluster/authentik?inst=missing")}>invalid instance</button>
          <output aria-label="current search">{location.search}</output>
        </>
      );
    };

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/cluster/authentik?inst=secondary"]}>
          <AuthentikPage />
          <HistoryDriver />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { level: 2, name: "备用认证中心" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "invalid instance" }));
    expect(await screen.findByRole("heading", { level: 2, name: "主认证中心" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("current search")).toHaveTextContent("?inst=primary"));
  });

  it("opens new=1 reliably when instances are already cached", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["authentik-instances"], { instances });

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/cluster/authentik?new=1"]}>
          <AuthentikPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("dialog", { name: "添加 Authentik 实例" })).toBeInTheDocument();
  });
});
