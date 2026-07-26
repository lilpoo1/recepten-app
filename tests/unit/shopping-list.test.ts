import { describe, expect, it } from "vitest";
import {
  aggregateBringItems,
  buildMealGroups,
  getBringSelectionStats,
  parseShoppingPreferences,
  serializeShoppingPreferences,
  toBringQuantityText,
} from "@/lib/shopping-list";
import { MealPlanEntry, Recipe } from "@/types";

const recipe: Recipe = {
  id: "recipe-1",
  householdId: "household-1",
  createdBy: "user-1",
  title: "Pasta",
  ingredients: [
    { name: "Tomaat", quantityText: "2 stuks" },
    { name: "Tomaat", quantityText: "1 stuks" },
    { name: "Basilicum", quantityText: "naar smaak" },
  ],
  baseServings: 2,
  steps: [],
  tags: [],
  cookingHistory: [],
  createdAt: 1,
  updatedAt: 1,
  version: 1,
};

function mealPlanEntry(
  overrides: Partial<MealPlanEntry> = {}
): MealPlanEntry {
  return {
    id: "meal-1",
    householdId: "household-1",
    createdBy: "user-1",
    date: "2026-07-27",
    recipeId: recipe.id,
    servings: 4,
    mealType: "dinner",
    createdAt: 1,
    updatedAt: 1,
    version: 1,
    ...overrides,
  };
}

describe("shopping list domain", () => {
  it("groups meals and scales duplicate numeric ingredients", () => {
    const groups = buildMealGroups([mealPlanEntry()], [recipe]);

    expect(groups).toHaveLength(1);
    expect(groups[0].ingredients).toEqual([
      expect.objectContaining({
        name: "Basilicum",
        quantityText: "naar smaak",
        isNumeric: false,
      }),
      expect.objectContaining({
        name: "Tomaat",
        amount: 6,
        unit: "stuks",
        isNumeric: true,
      }),
    ]);
  });

  it("aggregates matching ingredients across meals and respects exclusions", () => {
    const groups = buildMealGroups(
      [
        mealPlanEntry(),
        mealPlanEntry({
          id: "meal-2",
          date: "2026-07-28",
          servings: 2,
          mealType: "lunch",
        }),
      ],
      [recipe]
    );
    const excludedIngredient = groups[0].ingredients.find(
      (ingredient) => ingredient.name === "Basilicum"
    );

    const items = aggregateBringItems(
      groups,
      new Set([groups[1].id]),
      new Set(excludedIngredient ? [excludedIngredient.id] : [])
    );

    expect(items).toEqual([
      expect.objectContaining({ name: "Tomaat", amount: 6, unit: "stuks" }),
    ]);
    expect(toBringQuantityText(items[0])).toBe("6 stuks");
  });

  it("calculates row and meal selection statistics", () => {
    const groups = buildMealGroups([mealPlanEntry()], [recipe]);
    const stats = getBringSelectionStats(
      groups,
      new Set(),
      new Set(groups[0].ingredients.map((ingredient) => ingredient.id))
    );

    expect(stats).toMatchObject({
      totalIngredientRows: 2,
      toBringIngredientRows: 0,
      notToBringIngredientRows: 2,
      fullyNotToBringMealCount: 1,
    });
    expect(stats.byMeal.get(groups[0].id)).toEqual({
      toBring: 0,
      notToBring: 2,
      allNotToBring: true,
    });
  });

  it("reads legacy preferences and writes backward-compatible payloads", () => {
    const preferences = parseShoppingPreferences({
      discardedMealIds: ["meal-1", 42 as unknown as string],
      discardedIngredientIds: ["ingredient-1"],
      collapsedMealIds: ["meal-1"],
    });

    expect(preferences).toEqual({
      notToBringMealIds: ["meal-1"],
      notToBringIngredientIds: ["ingredient-1"],
      collapsedMealIds: ["meal-1"],
    });
    expect(serializeShoppingPreferences(preferences)).toMatchObject({
      notToBringMealIds: ["meal-1"],
      discardedMealIds: ["meal-1"],
      notToBringIngredientIds: ["ingredient-1"],
      discardedIngredientIds: ["ingredient-1"],
    });
  });
});
