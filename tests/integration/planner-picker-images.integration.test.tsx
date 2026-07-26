// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PlannerPage from "@/app/planner/page";
import type { Recipe } from "@/types";

const imageDataUrl = "data:image/png;base64,AA==";

const recipes: Recipe[] = [
    {
        id: "recipe-1",
        householdId: "household-1",
        createdBy: "user-1",
        title: "Pasta",
        image: imageDataUrl,
        ingredients: [],
        baseServings: 2,
        steps: [],
        prepTimeMinutes: 20,
        tags: [],
        cookingHistory: [],
        createdAt: 1,
        updatedAt: 1,
        version: 1,
    },
    {
        id: "recipe-2",
        householdId: "household-1",
        createdBy: "user-1",
        title: "Soep",
        ingredients: [],
        baseServings: 4,
        steps: [],
        tags: [],
        cookingHistory: [],
        createdAt: 1,
        updatedAt: 1,
        version: 1,
    },
];

const mocks = vi.hoisted(() => ({
    addToMealPlan: vi.fn(),
    removeFromMealPlan: vi.fn(),
    markAsCooked: vi.fn(),
}));

vi.mock("@/context/StoreContext", () => ({
    useStore: () => ({
        recipes,
        mealPlan: [],
        addToMealPlan: mocks.addToMealPlan,
        removeFromMealPlan: mocks.removeFromMealPlan,
        markAsCooked: mocks.markAsCooked,
    }),
}));

beforeEach(() => {
    vi.clearAllMocks();
});

describe("weekmenu receptpicker", () => {
    it("toont een decoratieve thumbnail en een vaste fallback zonder afbeelding", async () => {
        const user = userEvent.setup();
        const { container } = render(<PlannerPage />);

        await user.click(
            screen.getAllByRole("button", { name: /Maaltijd kiezen voor/i })[0]
        );

        const pastaButton = screen.getByRole("button", { name: /Pasta/i });
        const pastaImage = pastaButton.querySelector("img");
        expect(pastaImage).toHaveAttribute("src", imageDataUrl);
        expect(pastaImage).toHaveAttribute("alt", "");
        expect(pastaImage).toHaveAttribute("aria-hidden", "true");
        expect(pastaImage?.parentElement).toHaveClass(
            "w-28",
            "self-stretch",
            "overflow-hidden"
        );
        expect(pastaButton).toHaveClass("items-stretch", "overflow-hidden");
        expect(pastaButton).not.toHaveClass("px-3", "py-3");

        const soupButton = screen.getByRole("button", { name: /Soep/i });
        const fallback = within(soupButton).getByText("R");
        expect(fallback).toHaveAttribute("aria-hidden", "true");
        expect(fallback).toHaveClass("w-28", "self-stretch");
        expect(container.querySelectorAll(".w-28.self-stretch")).toHaveLength(2);
        expect(within(pastaButton).getByText("Pasta").parentElement?.parentElement).toHaveClass(
            "px-3",
            "py-2"
        );
    });
});
