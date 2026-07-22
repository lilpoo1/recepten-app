import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocalDataSource } from "@/lib/data/local-data-source";
import type { RecipeDraft } from "@/types";
import { resetBrowserTestState } from "@/tests/helpers/browser-test-state";

const draft: RecipeDraft = {
    title: "Pasta",
    description: "",
    ingredients: [{ name: "Tomaat", quantityText: "2 stuks" }],
    baseServings: 2,
    steps: ["Snijd"],
    tags: ["snel"],
    notes: "",
};

let source: LocalDataSource;

beforeEach(async () => {
    vi.useRealTimers();
    await resetBrowserTestState();
    source = new LocalDataSource();
});

describe("LocalDataSource with IndexedDB", () => {
    it("maakt en wijzigt recepten met optimistic concurrency en revisions", async () => {
        const id = await source.addRecipe("household-1", "user-1", draft);
        const original = (await source.loadHouseholdData("household-1")).recipes[0];

        await source.updateRecipe("household-1", "user-1", { ...original, title: "Nieuwe pasta" });
        const updated = (await source.loadHouseholdData("household-1")).recipes[0];
        expect(updated).toMatchObject({ id, title: "Nieuwe pasta", version: 2 });

        const revisions = await source.loadRecipeRevisions("household-1", id);
        expect(revisions).toHaveLength(1);
        expect(revisions[0]).toMatchObject({ action: "update", version: 1 });
        expect(revisions[0].snapshot.title).toBe("Pasta");
        await expect(
            source.updateRecipe("household-1", "user-1", { ...original, title: "Verouderd" })
        ).rejects.toThrow("intussen gewijzigd");
    });

    it("verwijdert recepten zacht en kan ze met historie herstellen", async () => {
        const id = await source.addRecipe("household-1", "user-1", draft);
        await source.deleteRecipe("household-1", "user-1", id);

        expect((await source.loadHouseholdData("household-1")).recipes).toEqual([]);
        expect(await source.loadDeletedRecipes("household-1")).toHaveLength(1);

        await source.restoreRecipe("household-1", "user-1", id);
        const restored = (await source.loadHouseholdData("household-1")).recipes[0];
        expect(restored.deletedAt).toBeUndefined();
        expect(restored).toMatchObject({ id, version: 3 });
        expect((await source.loadRecipeRevisions("household-1", id)).map((item) => item.action))
            .toEqual(["restore", "delete"]);
    });

    it("herstelt een gekozen receptversie en bewaart de vervangen versie", async () => {
        const id = await source.addRecipe("household-1", "user-1", draft);
        const original = (await source.loadHouseholdData("household-1")).recipes[0];
        await source.updateRecipe("household-1", "user-1", { ...original, title: "Versie twee" });
        const target = (await source.loadRecipeRevisions("household-1", id))[0];

        await source.restoreRecipeVersion("household-1", "user-1", id, target.id);
        const restored = (await source.loadHouseholdData("household-1")).recipes[0];
        expect(restored).toMatchObject({ title: "Pasta", version: 3 });
        expect((await source.loadRecipeRevisions("household-1", id))[0].snapshot.title)
            .toBe("Versie twee");
    });

    it("vervangt alleen hetzelfde weekmenuslot en verwijdert exact", async () => {
        await source.upsertMealPlanEntry("household-1", "user-1", {
            date: "2026-07-22", recipeId: "recipe-1", servings: 2, mealType: "dinner",
        });
        await source.upsertMealPlanEntry("household-1", "user-1", {
            date: "2026-07-22", recipeId: "recipe-2", servings: 4, mealType: "dinner",
        });
        await source.upsertMealPlanEntry("household-1", "user-1", {
            date: "2026-07-22", recipeId: "recipe-1", servings: 1, mealType: "lunch",
        });

        const entries = (await source.loadHouseholdData("household-1")).mealPlan;
        expect(entries).toHaveLength(2);
        expect(entries).toEqual(expect.arrayContaining([
            expect.objectContaining({ recipeId: "recipe-2", servings: 4, mealType: "dinner" }),
            expect.objectContaining({ recipeId: "recipe-1", servings: 1, mealType: "lunch" }),
        ]));

        await source.removeMealPlanEntry("household-1", "2026-07-22", "recipe-2", "dinner");
        expect((await source.loadHouseholdData("household-1")).mealPlan)
            .toEqual([expect.objectContaining({ mealType: "lunch" })]);
    });
});
