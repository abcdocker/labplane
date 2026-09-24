// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import Header from "./Header";

vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({
    status: { loggedIn: true, role: "admin", username: "admin" },
    logout: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-app-config", () => ({
  useAppConfig: () => ({ data: { dashboardRole: "admin" } }),
}));

vi.mock("@/components/GlobalSearchBar", () => ({
  default: () => <div aria-label="全局搜索" />,
}));

vi.mock("@/components/HeaderNotificationsSheet", () => ({
  default: () => null,
}));

describe("Header workspace navigation", () => {
  it("offers Gateway API without exposing the removed Baota workspace", async () => {
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    );

    const trigger = screen.getByRole("button", { name: /切换工作区/ });
    expect(trigger).toHaveAccessibleName(/Gateway API/);
    expect(trigger).not.toHaveAccessibleName(/宝塔/);

    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    expect(await screen.findByText("Gateway API")).toBeInTheDocument();
    expect(screen.queryByText("宝塔")).not.toBeInTheDocument();
  });
});
