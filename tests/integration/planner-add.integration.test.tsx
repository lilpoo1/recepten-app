// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AddRecipePage from "@/app/planner/add/page";
import type { Recipe } from "@/types";

const recipes: Recipe[] = [
    {
        id: "recipe-1",
        householdId: "household-1",
        createdBy: "user-1",
        title: "Pasta",
        ingredients: [],
        baseServings: 2,
        steps: [],
        prepTimeMinutes: 20,
        difficulty: 2,
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
        title: "Risotto",
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
    push: vi.fn(),
    back: vi.fn(),
    searchGet: vi.fn(),
}));

vi.mock("@/context/StoreContext", () => ({
    useStore: () => ({ recipes, addToMealPlan: mocks.addToMealPlan }),
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: mocks.push, back: mocks.back }),
    useSearchParams: () => ({ get: mocks.searchGet }),
}));

beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchGet.mockImplementation((key: string) => key === "date" ? "2026-07-22" : null);
    mocks.addToMealPlan.mockResolvedValue(undefined);
});

describe("planner add flow", () => {
    it("selecteert een recept en bewaart type en porties", async () => {
        const user = userEvent.setup();
        render(<AddRecipePage />);

        await user.click(screen.getByRole("button", { name: /Pasta/ }));
        await user.selectOptions(screen.getByLabelText("Type"), "lunch");
        await user.clear(screen.getByLabelText("Personen"));
        await user.type(screen.getByLabelText("Personen"), "3");
        await user.click(screen.getByRole("button", { name: "Opslaan" }));

        await waitFor(() => expect(mocks.addToMealPlan).toHaveBeenCalledWith({
            date: "2026-07-22",
            recipeId: "recipe-1",
            servings: 3,
            mealType: "lunch",
        }));
        expect(mocks.push).toHaveBeenCalledWith("/planner");
    });

    it("filtert recepten en handelt een ontbrekende datum af", async () => {
        const user = userEvent.setup();
        const { unmount } = render(<AddRecipePage />);
        await user.type(screen.getByPlaceholderText("Zoek recept..."), "ris");
        expect(screen.getByText("Risotto")).toBeInTheDocument();
        expect(screen.queryByText("Pasta")).not.toBeInTheDocument();

        unmount();
        mocks.searchGet.mockReturnValue(null);
        render(<AddRecipePage />);
        expect(screen.getByText("Geen datum geselecteerd.")).toBeInTheDocument();
    });
});
