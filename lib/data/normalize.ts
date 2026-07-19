import { MealPlanEntry, Recipe } from "@/types";
import { createId } from "@/lib/utils/ids";
import { toMillis } from "@/lib/utils/time";
import { composeQuantityTextFromLegacy } from "@/lib/utils/quantity";

interface UnknownRecord {
    [key: string]: unknown;
}

function asRecord(value: unknown): UnknownRecord {
    return typeof value === "object" && value !== null ? (value as UnknownRecord) : {};
}

function normalizeIngredient(
    value: unknown
): Recipe["ingredients"][number] | null {
    const data = asRecord(value);
    const name = typeof data.name === "string" ? data.name : "";
    if (!name.trim()) {
        return null;
    }

    const quantityText =
        typeof data.quantityText === "string"
            ? data.quantityText.trim()
            : composeQuantityTextFromLegacy(
                typeof data.amount === "number" ? data.amount : 0,
                typeof data.unit === "string" ? data.unit : ""
            );

    if (quantityText) {
        return { name, quantityText };
    }

    return { name };
}

export function normalizeRecipe(
    value: unknown,
    householdId: string,
    userId: string
): Recipe {
    const data = asRecord(value);
    const createdAt = toMillis(data.createdAt);

    return {
        id: typeof data.id === "string" ? data.id : createId(),
        householdId,
        createdBy: typeof data.createdBy === "string" ? data.createdBy : userId,
        title: typeof data.title === "string" ? data.title : "Onbekend recept",
        description: typeof data.description === "string" ? data.description : "",
        image: typeof data.image === "string" ? data.image : undefined,
        ingredients: Array.isArray(data.ingredients)
            ? data.ingredients
                .map((ingredient) => normalizeIngredient(ingredient))
                .filter((ingredient): ingredient is Recipe["ingredients"][number] => Boolean(ingredient))
            : [],
        baseServings:
            typeof data.baseServings === "number" && data.baseServings > 0
                ? data.baseServings
                : 2,
        steps: Array.isArray(data.steps) ? (data.steps as string[]) : [],
        prepTimeMinutes:
            typeof data.prepTimeMinutes === "number" ? data.prepTimeMinutes : undefined,
        difficulty:
            typeof data.difficulty === "number" &&
            [1, 2, 3, 4, 5].includes(data.difficulty)
                ? (data.difficulty as Recipe["difficulty"])
                : undefined,
        tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
        notes: typeof data.notes === "string" ? data.notes : "",
        cookingHistory: Array.isArray(data.cookingHistory)
            ? (data.cookingHistory as number[]).filter((item) => typeof item === "number")
            : [],
        createdAt,
        updatedAt: toMillis(data.updatedAt, createdAt),
        version: typeof data.version === "number" ? data.version : 1,
    };
}

export function normalizeMealPlanEntry(
    value: unknown,
    householdId: string,
    userId: string
): MealPlanEntry {
    const data = asRecord(value);
    const createdAt = toMillis(data.createdAt);
    const mealType =
        data.mealType === "lunch" || data.mealType === "other" ? data.mealType : "dinner";

    return {
        id: typeof data.id === "string" ? data.id : createId(),
        date: typeof data.date === "string" ? data.date : new Date().toISOString().slice(0, 10),
        householdId,
        createdBy: typeof data.createdBy === "string" ? data.createdBy : userId,
        recipeId: typeof data.recipeId === "string" ? data.recipeId : "",
        servings: typeof data.servings === "number" && data.servings > 0 ? data.servings : 2,
        mealType,
        createdAt,
        updatedAt: toMillis(data.updatedAt, createdAt),
        version: typeof data.version === "number" ? data.version : 1,
    };
}
