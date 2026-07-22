// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RecipeForm from "@/components/RecipeForm";
import type { Recipe } from "@/types";

const mocks = vi.hoisted(() => ({
    addRecipe: vi.fn(),
    updateRecipe: vi.fn(),
    push: vi.fn(),
}));

vi.mock("@/context/StoreContext", () => ({
    useStore: () => ({ addRecipe: mocks.addRecipe, updateRecipe: mocks.updateRecipe }),
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: mocks.push }),
}));

const initialRecipe: Recipe = {
    id: "recipe-1",
    householdId: "household-1",
    createdBy: "user-1",
    title: "Oude titel",
    ingredients: [{ name: "Tomaat", quantityText: "2 stuks" }],
    baseServings: 2,
    steps: ["Snijd"],
    prepTimeMinutes: 30,
    difficulty: 3,
    tags: [],
    cookingHistory: [],
    createdAt: 1,
    updatedAt: 1,
    version: 1,
};

beforeEach(() => {
    vi.clearAllMocks();
    mocks.addRecipe.mockResolvedValue(undefined);
    mocks.updateRecipe.mockResolvedValue(undefined);
});

describe("RecipeForm", () => {
    it("valideert dat minimaal één ingrediënt nodig is", async () => {
        const user = userEvent.setup();
        render(<RecipeForm />);
        await user.type(screen.getByLabelText("Titel"), "Pasta");
        await user.click(screen.getByRole("button", { name: "Opslaan" }));
        expect(await screen.findByText("Voeg minimaal 1 ingredient toe.")).toBeInTheDocument();
        expect(mocks.addRecipe).not.toHaveBeenCalled();
    });

    it("bouwt een genormaliseerd nieuw recept en navigeert na opslag", async () => {
        const user = userEvent.setup();
        render(<RecipeForm />);

        await user.type(screen.getByLabelText("Titel"), "  Pasta rood  ");
        await user.type(screen.getByPlaceholderText("Hoeveelheid + eenheid (optioneel)"), "2 stuks");
        await user.type(screen.getByPlaceholderText("Ingredient"), " Tomaat ");
        await user.click(screen.getByRole("button", { name: "Voeg ingredient toe" }));
        await user.type(screen.getByPlaceholderText("Stap beschrijving..."), " Snijd fijn ");
        await user.click(screen.getByRole("button", { name: "Voeg stap toe" }));
        await user.click(screen.getByRole("button", { name: "Opslaan" }));

        await waitFor(() => expect(mocks.addRecipe).toHaveBeenCalledTimes(1));
        expect(mocks.addRecipe).toHaveBeenCalledWith(expect.objectContaining({
            title: "Pasta rood",
            ingredients: [{ name: "Tomaat", quantityText: "2 stuks" }],
            steps: ["Snijd fijn"],
            prepTimeMinutes: 30,
            difficulty: 3,
            baseServings: 2,
        }));
        expect(mocks.push).toHaveBeenCalledWith("/recipes");
    });

    it("werkt een bestaand recept bij en toont opslagfouten", async () => {
        const user = userEvent.setup();
        mocks.updateRecipe.mockRejectedValueOnce(new Error("Conflict bij opslaan."));
        render(<RecipeForm initialRecipe={initialRecipe} />);

        await user.clear(screen.getByLabelText("Titel"));
        await user.type(screen.getByLabelText("Titel"), "Nieuwe titel");
        await user.click(screen.getByRole("button", { name: "Opslaan" }));

        expect(await screen.findByText("Conflict bij opslaan.")).toBeInTheDocument();
        expect(mocks.updateRecipe).toHaveBeenCalledWith(expect.objectContaining({
            id: "recipe-1",
            title: "Nieuwe titel",
        }));
        expect(mocks.push).not.toHaveBeenCalled();
    });
});
