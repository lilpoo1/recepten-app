// @vitest-environment jsdom

import { format, startOfWeek } from "date-fns";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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
    mocks.addToMealPlan.mockResolvedValue(undefined);
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

    it("selecteert eerst en bewaart daarna type en aangepaste personen", async () => {
        const user = userEvent.setup();
        render(<PlannerPage />);

        await user.click(
            screen.getAllByRole("button", { name: /Maaltijd kiezen voor/i })[0]
        );
        const pastaButton = screen.getByRole("button", { name: /Pasta/i });
        await user.click(pastaButton);

        expect(mocks.addToMealPlan).not.toHaveBeenCalled();
        expect(screen.getByLabelText("Personen")).toHaveValue(2);
        expect(pastaButton).toHaveAttribute("aria-pressed", "true");
        expect(within(pastaButton).getByText("Geselecteerd")).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Lunch" }));
        await user.clear(screen.getByLabelText("Personen"));
        await user.type(screen.getByLabelText("Personen"), "3");
        await user.click(screen.getByRole("button", { name: "Toevoegen" }));

        await waitFor(() =>
            expect(mocks.addToMealPlan).toHaveBeenCalledWith({
                date: format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"),
                recipeId: "recipe-1",
                servings: 3,
                mealType: "lunch",
            })
        );
        expect(screen.queryByRole("heading", { name: "Kies recept" })).not.toBeInTheDocument();
    });

    it("valideert personen en reset de invoer wanneer de picker opnieuw opent", async () => {
        const user = userEvent.setup();
        render(<PlannerPage />);

        await user.click(
            screen.getAllByRole("button", { name: /Maaltijd kiezen voor/i })[0]
        );
        await user.click(screen.getByRole("button", { name: /Soep/i }));
        expect(screen.getByLabelText("Personen")).toHaveValue(4);

        await user.clear(screen.getByLabelText("Personen"));
        expect(screen.getByRole("alert")).toHaveTextContent(/minimaal 1/i);
        expect(screen.getByRole("button", { name: "Toevoegen" })).toBeDisabled();

        await user.click(screen.getByRole("button", { name: "Sluit" }));
        await user.click(
            screen.getAllByRole("button", { name: /Maaltijd kiezen voor/i })[0]
        );

        expect(screen.getByLabelText("Personen")).toHaveValue(null);
        expect(screen.getByLabelText("Personen")).toBeDisabled();
        expect(screen.getByRole("button", { name: "Diner" })).toHaveAttribute(
            "aria-pressed",
            "true"
        );
        expect(screen.getByRole("button", { name: "Toevoegen" })).toBeDisabled();
        expect(screen.queryByText("Geselecteerd")).not.toBeInTheDocument();
    });

    it("behoudt selectie en personen wanneer opslaan mislukt", async () => {
        mocks.addToMealPlan.mockRejectedValueOnce(new Error("Netwerkfout"));
        const user = userEvent.setup();
        render(<PlannerPage />);

        await user.click(
            screen.getAllByRole("button", { name: /Maaltijd kiezen voor/i })[0]
        );
        const pastaButton = screen.getByRole("button", { name: /Pasta/i });
        await user.click(pastaButton);
        await user.click(screen.getByRole("button", { name: "Toevoegen" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Netwerkfout");
        expect(screen.getByLabelText("Personen")).toHaveValue(2);
        expect(pastaButton).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByRole("heading", { name: "Kies recept" })).toBeInTheDocument();
    });
});
