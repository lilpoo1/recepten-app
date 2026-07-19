import { DataSource, HouseholdSnapshot, Unsubscribe } from "@/lib/data/types";
import {
    BringShareSnapshotInput,
    BringShareSnapshotResult,
    MealPlanDraft,
    MealPlanEntry,
    Recipe,
    RecipeDraft,
} from "@/types";
import { createId } from "@/lib/utils/ids";
import { normalizeMealPlanEntry, normalizeRecipe } from "@/lib/data/normalize";
import {
    readLocalMealPlan,
    readLocalRecipes,
    writeLocalValue,
} from "@/lib/storage/browser-storage";

const RECIPES_KEY = "recipes";
const MEAL_PLAN_KEY = "mealPlan";

async function readArray(key: string, householdId: string, userId: string): Promise<unknown[]> {
    if (key === RECIPES_KEY) {
        return readLocalRecipes(householdId, userId);
    }
    return readLocalMealPlan(householdId, userId);
}

async function writeArray(key: string, data: unknown[]) {
    await writeLocalValue(key, data);
}

export class LocalDataSource implements DataSource {
    readonly mode = "local" as const;

    async loadHouseholdData(householdId: string): Promise<HouseholdSnapshot> {
        const fallbackUser = "local-user";
        const recipes = (await readArray(RECIPES_KEY, householdId, fallbackUser)).map((item) =>
            normalizeRecipe(item, householdId, fallbackUser)
        );
        const mealPlan = (await readArray(MEAL_PLAN_KEY, householdId, fallbackUser)).map((item) =>
            normalizeMealPlanEntry(item, householdId, fallbackUser)
        );

        return { recipes, mealPlan };
    }

    watchHouseholdData(
        householdId: string,
        onChange: (snapshot: HouseholdSnapshot) => void
    ): Unsubscribe {
        void householdId;
        void onChange;
        return () => undefined;
    }

    async addRecipe(householdId: string, userId: string, draft: RecipeDraft): Promise<string> {
        const now = Date.now();
        const existing = (await readArray(RECIPES_KEY, householdId, userId)).map((item) =>
            normalizeRecipe(item, householdId, userId)
        );
        const id = createId();
        const recipe: Recipe = {
            ...draft,
            id,
            householdId,
            createdBy: userId,
            cookingHistory: [],
            createdAt: now,
            updatedAt: now,
            version: 1,
        };
        await writeArray(RECIPES_KEY, [...existing, recipe]);
        return id;
    }

    async updateRecipe(householdId: string, userId: string, recipe: Recipe): Promise<void> {
        const existing = (await readArray(RECIPES_KEY, householdId, userId)).map((item) =>
            normalizeRecipe(item, householdId, userId)
        );
        await writeArray(
            RECIPES_KEY,
            existing.map((item) =>
                item.id === recipe.id
                    ? {
                        ...recipe,
                        updatedAt: Date.now(),
                        version: item.version + 1,
                    }
                    : item
            )
        );
    }

    async deleteRecipe(householdId: string, recipeId: string): Promise<void> {
        const recipes = (await readArray(RECIPES_KEY, householdId, "local-user")).map((item) =>
            normalizeRecipe(item, householdId, "local-user")
        );
        const mealPlan = (await readArray(MEAL_PLAN_KEY, householdId, "local-user")).map((item) =>
            normalizeMealPlanEntry(item, householdId, "local-user")
        );

        await writeArray(
            RECIPES_KEY,
            recipes.filter((item) => item.id !== recipeId)
        );
        await writeArray(
            MEAL_PLAN_KEY,
            mealPlan.filter((entry) => entry.recipeId !== recipeId)
        );
    }

    async markAsCooked(householdId: string, recipeId: string): Promise<void> {
        const recipes = (await readArray(RECIPES_KEY, householdId, "local-user")).map((item) =>
            normalizeRecipe(item, householdId, "local-user")
        );
        const now = Date.now();

        await writeArray(
            RECIPES_KEY,
            recipes.map((recipe) =>
                recipe.id === recipeId
                    ? {
                        ...recipe,
                        cookingHistory: [...recipe.cookingHistory, now],
                        updatedAt: now,
                        version: recipe.version + 1,
                    }
                    : recipe
            )
        );
    }

    async upsertMealPlanEntry(
        householdId: string,
        userId: string,
        draft: MealPlanDraft
    ): Promise<void> {
        const entries = (await readArray(MEAL_PLAN_KEY, householdId, userId)).map((item) =>
            normalizeMealPlanEntry(item, householdId, userId)
        );
        const now = Date.now();

        const withoutSlot = entries.filter(
            (entry) => !(entry.date === draft.date && entry.mealType === draft.mealType)
        );

        const nextEntry: MealPlanEntry = {
            id: createId(),
            householdId,
            createdBy: userId,
            date: draft.date,
            recipeId: draft.recipeId,
            servings: draft.servings,
            mealType: draft.mealType,
            createdAt: now,
            updatedAt: now,
            version: 1,
        };

        await writeArray(MEAL_PLAN_KEY, [...withoutSlot, nextEntry]);
    }

    async removeMealPlanEntry(
        householdId: string,
        date: string,
        recipeId: string,
        mealType: MealPlanEntry["mealType"]
    ): Promise<void> {
        const entries = (await readArray(MEAL_PLAN_KEY, householdId, "local-user")).map((item) =>
            normalizeMealPlanEntry(item, householdId, "local-user")
        );
        await writeArray(
            MEAL_PLAN_KEY,
            entries.filter(
                (entry) =>
                    !(entry.date === date && entry.recipeId === recipeId && entry.mealType === mealType)
            )
        );
    }

    async createBringShareSnapshot(
        _householdId: string,
        _userId: string,
        _input: BringShareSnapshotInput,
        _baseUrl: string
    ): Promise<BringShareSnapshotResult> {
        void _householdId;
        void _userId;
        void _input;
        void _baseUrl;
        throw new Error(
            "Bring-link generatie werkt alleen in Firebase modus op een gehoste omgeving."
        );
    }
}
