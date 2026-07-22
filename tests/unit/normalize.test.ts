import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeMealPlanEntry, normalizeRecipe } from "@/lib/data/normalize";

afterEach(() => vi.useRealTimers());

describe("data normalization", () => {
    it("normaliseert legacy recepten en filtert ongeldige waarden", () => {
        const recipe = normalizeRecipe(
            {
                title: "Pasta",
                ingredients: [
                    { name: "Tomaat", amount: 2, unit: "stuks" },
                    { name: "  " },
                ],
                steps: ["Snijd", 3, null],
                tags: ["snel", false],
                baseServings: Number.POSITIVE_INFINITY,
                prepTimeMinutes: Number.NaN,
                cookingHistory: [10, "gisteren"],
                createdAt: { toMillis: () => 100 },
            },
            "household-1",
            "user-1"
        );

        expect(recipe).toMatchObject({
            householdId: "household-1",
            createdBy: "user-1",
            title: "Pasta",
            ingredients: [{ name: "Tomaat", quantityText: "2 stuks" }],
            steps: ["Snijd"],
            tags: ["snel"],
            baseServings: 2,
            cookingHistory: [10],
            createdAt: 100,
            updatedAt: 100,
        });
        expect(recipe.prepTimeMinutes).toBeUndefined();
    });

    it("past veilige defaults toe op onbekende receptdata", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-07-22T10:00:00Z"));
        const recipe = normalizeRecipe(null, "household-1", "user-1");
        expect(recipe.title).toBe("Onbekend recept");
        expect(recipe.baseServings).toBe(2);
        expect(recipe.version).toBe(1);
        expect(recipe.createdAt).toBe(Date.now());
    });

    it("normaliseert weekmenuvelden en maaltijdtypen", () => {
        const entry = normalizeMealPlanEntry(
            { date: "2026-07-22", mealType: "breakfast", servings: Number.NaN, createdAt: 50 },
            "household-1",
            "user-1"
        );
        expect(entry).toMatchObject({
            date: "2026-07-22",
            mealType: "dinner",
            servings: 2,
            householdId: "household-1",
            createdBy: "user-1",
            createdAt: 50,
            updatedAt: 50,
        });
    });
});
