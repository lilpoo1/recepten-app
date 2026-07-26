// @vitest-environment jsdom

import { useState } from "react";
import { addDays, format, startOfWeek } from "date-fns";
import { nl } from "date-fns/locale";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WeekMenuPicker from "@/components/WeekMenuPicker";
import RecipesPage from "@/app/recipes/page";
import RecipeDetailClient from "@/app/recipes/[id]/RecipeDetailClient";
import type { MealPlanEntry, Recipe } from "@/types";

const recipe: Recipe = {
    id: "recipe-1",
    householdId: "household-1",
    createdBy: "user-1",
    title: "Pasta",
    ingredients: [],
    baseServings: 2,
    mealTypes: ["dinner", "lunch"],
    steps: [],
    prepTimeMinutes: 20,
    difficulty: 2,
    tags: ["Italiaans"],
    cookingHistory: [],
    createdAt: 1,
    updatedAt: 1,
    version: 1,
};

const otherRecipe: Recipe = {
    ...recipe,
    id: "recipe-2",
    title: "Risotto",
};

const mocks = vi.hoisted(() => ({
    addToMealPlan: vi.fn(),
    deleteRecipe: vi.fn(),
    push: vi.fn(),
    mealPlan: [] as MealPlanEntry[],
}));

vi.mock("@/context/StoreContext", () => ({
    useStore: () => ({
        recipes: [recipe, otherRecipe],
        mealPlan: mocks.mealPlan,
        addToMealPlan: mocks.addToMealPlan,
        deleteRecipe: mocks.deleteRecipe,
        getRecipeById: (id: string) => [recipe, otherRecipe].find((item) => item.id === id),
    }),
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: mocks.push }),
}));

function currentMonday() {
    return startOfWeek(new Date(), { weekStartsOn: 1 });
}

function dayButtonLabel(date: Date) {
    return new RegExp(format(date, "EEEE d MMMM", { locale: nl }), "i");
}

function PickerHarness() {
    const [open, setOpen] = useState(false);

    return (
        <>
            <button type="button" onClick={() => setOpen(true)}>
                Open picker
            </button>
            <WeekMenuPicker recipe={recipe} open={open} onClose={() => setOpen(false)} />
        </>
    );
}

beforeEach(() => {
    vi.clearAllMocks();
    mocks.mealPlan = [];
    mocks.addToMealPlan.mockResolvedValue(undefined);
});

describe("weekmenu-picker", () => {
    it("opent met diner, basisporties en kan onbeperkt van week wisselen", async () => {
        const user = userEvent.setup();
        render(<WeekMenuPicker recipe={recipe} open onClose={vi.fn()} />);

        expect(screen.getByRole("radio", { name: "Diner" })).toBeChecked();
        expect(screen.getByLabelText("Personen")).toHaveValue(2);
        expect(
            screen.getByRole("button", { name: dayButtonLabel(currentMonday()) })
        ).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Volgende week" }));
        expect(
            screen.getByRole("button", {
                name: dayButtonLabel(addDays(currentMonday(), 7)),
            })
        ).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Vorige week" }));
        await user.click(screen.getByRole("button", { name: "Vorige week" }));
        expect(
            screen.getByRole("button", {
                name: dayButtonLabel(addDays(currentMonday(), -7)),
            })
        ).toBeInTheDocument();
    });

    it("bewaart gekozen dag, maaltijdtype en porties en geeft succesfeedback", async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        render(<WeekMenuPicker recipe={recipe} open onClose={onClose} />);

        await user.click(screen.getByRole("radio", { name: "Lunch" }));
        await user.clear(screen.getByLabelText("Personen"));
        await user.type(screen.getByLabelText("Personen"), "3");
        await user.click(
            screen.getByRole("button", { name: dayButtonLabel(currentMonday()) })
        );

        await waitFor(() =>
            expect(mocks.addToMealPlan).toHaveBeenCalledWith({
                date: format(currentMonday(), "yyyy-MM-dd"),
                recipeId: "recipe-1",
                servings: 3,
                mealType: "lunch",
            })
        );
        expect(onClose).toHaveBeenCalledOnce();
        expect(screen.getByRole("status")).toHaveTextContent(
            /Pasta is toegevoegd aan/i
        );
    });

    it("toont alleen recepttypen en kiest het eerste type wanneer diner ontbreekt", () => {
        render(
            <WeekMenuPicker
                recipe={{ ...recipe, mealTypes: ["lunch", "other"] }}
                open
                onClose={vi.fn()}
            />
        );

        expect(screen.queryByRole("radio", { name: "Diner" })).not.toBeInTheDocument();
        expect(screen.getByRole("radio", { name: "Lunch" })).toBeChecked();
        expect(screen.getByRole("radio", { name: "Anders" })).toBeInTheDocument();
    });

    it("vraagt bevestiging voordat een bezet slot wordt bijgewerkt", async () => {
        const monday = currentMonday();
        mocks.mealPlan = [
            {
                id: "meal-1",
                householdId: "household-1",
                createdBy: "user-1",
                recipeId: "recipe-2",
                date: format(monday, "yyyy-MM-dd"),
                servings: 4,
                mealType: "dinner",
                createdAt: 1,
                updatedAt: 1,
                version: 1,
            },
        ];
        const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
        const user = userEvent.setup();
        render(<WeekMenuPicker recipe={recipe} open onClose={vi.fn()} />);

        expect(
            screen.getByRole("button", { name: dayButtonLabel(monday) })
        ).toHaveTextContent("Risotto");

        await user.click(screen.getByRole("button", { name: dayButtonLabel(monday) }));
        expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining("Risotto"));
        expect(mocks.addToMealPlan).not.toHaveBeenCalled();

        confirmSpy.mockReturnValue(true);
        await user.click(screen.getByRole("button", { name: dayButtonLabel(monday) }));
        await waitFor(() => expect(mocks.addToMealPlan).toHaveBeenCalledOnce());
    });

    it("houdt de picker open en toont fouten en ongeldige porties", async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        render(<WeekMenuPicker recipe={recipe} open onClose={onClose} />);

        await user.clear(screen.getByLabelText("Personen"));
        await user.click(
            screen.getByRole("button", { name: dayButtonLabel(currentMonday()) })
        );
        expect(screen.getByRole("alert")).toHaveTextContent(/minimaal 1/i);
        expect(mocks.addToMealPlan).not.toHaveBeenCalled();

        await user.type(screen.getByLabelText("Personen"), "2");
        mocks.addToMealPlan.mockRejectedValueOnce(new Error("Netwerkfout"));
        await user.click(
            screen.getByRole("button", { name: dayButtonLabel(currentMonday()) })
        );
        expect(await screen.findByRole("alert")).toHaveTextContent("Netwerkfout");
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(onClose).not.toHaveBeenCalled();
    });

    it("sluit met Escape, herstelt focus en blokkeert alleen tijdens openen de achtergrondscroll", async () => {
        const user = userEvent.setup();
        render(<PickerHarness />);

        const trigger = screen.getByRole("button", { name: "Open picker" });
        trigger.focus();
        await user.click(trigger);

        await waitFor(() => expect(screen.getByRole("button", { name: "Sluit" })).toHaveFocus());
        expect(document.body.style.overflow).toBe("hidden");

        await user.keyboard("{Escape}");
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(trigger).toHaveFocus();
        expect(document.body.style.overflow).toBe("");
    });
});

describe("weekmenu-entrypoints", () => {
    it("opent dezelfde picker vanuit het receptenoverzicht en de receptdetailpagina", async () => {
        const user = userEvent.setup();
        const overview = render(<RecipesPage />);

        await user.click(
            screen.getByRole("button", { name: "Pasta aan weekmenu toevoegen" })
        );
        expect(
            screen.getByRole("heading", { name: "Toevoegen aan weekmenu" })
        ).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Sluit" }));

        overview.unmount();
        render(<RecipeDetailClient id="recipe-1" />);
        await user.click(
            screen.getByRole("button", { name: "Pasta aan weekmenu toevoegen" })
        );
        expect(
            screen.getByRole("heading", { name: "Toevoegen aan weekmenu" })
        ).toBeInTheDocument();
    });
});
