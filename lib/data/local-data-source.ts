import { DataSource, HouseholdSnapshot, Unsubscribe } from "@/lib/data/types";
import {
    BringShareSnapshotInput,
    BringShareSnapshotResult,
    MealPlanDraft,
    MealPlanEntry,
    Recipe,
    RecipeDraft,
    RecipeRevision,
    RecipeRevisionAction,
} from "@/types";
import { createId } from "@/lib/utils/ids";
import { normalizeMealPlanEntry, normalizeRecipe } from "@/lib/data/normalize";
import {
    readLocalMealPlan,
    readLocalRecipes,
    readLocalValue,
    writeLocalValue,
} from "@/lib/storage/browser-storage";

const RECIPES_KEY = "recipes";
const MEAL_PLAN_KEY = "mealPlan";
const REVISION_RETENTION_MS = 98 * 24 * 60 * 60 * 1000;
const revisionKey = (recipeId: string) => `local:recipe-revisions:${recipeId}`;

async function readArray(key: string, householdId: string, userId: string): Promise<unknown[]> {
    if (key === RECIPES_KEY) {
        return readLocalRecipes(householdId, userId);
    }
    return readLocalMealPlan(householdId, userId);
}

async function writeArray(key: string, data: unknown[]) {
    await writeLocalValue(key, data);
}

async function saveRevision(
    recipe: Recipe,
    userId: string,
    action: RecipeRevisionAction
): Promise<RecipeRevision> {
    const now = Date.now();
    const revision: RecipeRevision = {
        id: createId(),
        householdId: recipe.householdId,
        recipeId: recipe.id,
        version: recipe.version,
        action,
        snapshot: recipe,
        createdBy: userId,
        createdAt: now,
        expiresAt: now + REVISION_RETENTION_MS,
    };
    const existing = (await readLocalValue<RecipeRevision[]>(revisionKey(recipe.id))) ?? [];
    await writeLocalValue(
        revisionKey(recipe.id),
        [...existing.filter((item) => item.expiresAt > now), revision]
    );
    return revision;
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

        return { recipes: recipes.filter((recipe) => !recipe.deletedAt), mealPlan };
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
        const current = existing.find((item) => item.id === recipe.id);
        if (!current) {
            throw new Error("Recept bestaat niet meer.");
        }
        if (current.version !== recipe.version) {
            throw new Error("Dit recept is intussen gewijzigd. Vernieuw en probeer opnieuw.");
        }
        const revision = await saveRevision(current, userId, "update");
        await writeArray(
            RECIPES_KEY,
            existing.map((item) =>
                item.id === recipe.id
                    ? {
                        ...recipe,
                        updatedAt: Date.now(),
                        version: item.version + 1,
                        lastRevisionId: revision.id,
                    }
                    : item
            )
        );
    }

    async deleteRecipe(householdId: string, userId: string, recipeId: string): Promise<void> {
        const recipes = (await readArray(RECIPES_KEY, householdId, "local-user")).map((item) =>
            normalizeRecipe(item, householdId, "local-user")
        );
        const current = recipes.find((item) => item.id === recipeId);
        if (!current || current.deletedAt) {
            return;
        }
        const now = Date.now();
        const revision = await saveRevision(current, userId, "delete");
        await writeArray(
            RECIPES_KEY,
            recipes.map((item) =>
                item.id === recipeId
                    ? {
                        ...item,
                        deletedAt: now,
                        deletedBy: userId,
                        updatedAt: now,
                        version: item.version + 1,
                        lastRevisionId: revision.id,
                    }
                    : item
            )
        );
    }

    async restoreRecipe(householdId: string, userId: string, recipeId: string): Promise<void> {
        const recipes = (await readArray(RECIPES_KEY, householdId, userId)).map((item) =>
            normalizeRecipe(item, householdId, userId)
        );
        const current = recipes.find((item) => item.id === recipeId);
        if (!current || !current.deletedAt) {
            return;
        }
        const revision = await saveRevision(current, userId, "restore");
        const now = Date.now();
        await writeArray(
            RECIPES_KEY,
            recipes.map((item) => {
                if (item.id !== recipeId) {
                    return item;
                }
                const restored = {
                    ...item,
                    updatedAt: now,
                    version: item.version + 1,
                    lastRevisionId: revision.id,
                };
                delete restored.deletedAt;
                delete restored.deletedBy;
                return restored;
            })
        );
    }

    async loadDeletedRecipes(householdId: string): Promise<Recipe[]> {
        const recipes = (await readArray(RECIPES_KEY, householdId, "local-user")).map((item) =>
            normalizeRecipe(item, householdId, "local-user")
        );
        return recipes
            .filter((recipe) => Boolean(recipe.deletedAt))
            .sort((left, right) => (right.deletedAt ?? 0) - (left.deletedAt ?? 0));
    }

    async loadRecipeRevisions(
        _householdId: string,
        recipeId: string
    ): Promise<RecipeRevision[]> {
        void _householdId;
        const now = Date.now();
        return ((await readLocalValue<RecipeRevision[]>(revisionKey(recipeId))) ?? [])
            .filter((revision) => revision.expiresAt > now)
            .sort((left, right) => right.createdAt - left.createdAt);
    }

    async restoreRecipeVersion(
        householdId: string,
        userId: string,
        recipeId: string,
        revisionId: string
    ): Promise<void> {
        const recipes = (await readArray(RECIPES_KEY, householdId, userId)).map((item) =>
            normalizeRecipe(item, householdId, userId)
        );
        const current = recipes.find((item) => item.id === recipeId);
        const target = (await this.loadRecipeRevisions(householdId, recipeId)).find(
            (revision) => revision.id === revisionId
        );
        if (!current || !target) {
            throw new Error("De gekozen receptversie bestaat niet meer.");
        }
        const currentRevision = await saveRevision(current, userId, "restore");
        const restored = {
            ...target.snapshot,
            id: recipeId,
            householdId,
            createdAt: current.createdAt,
            updatedAt: Date.now(),
            version: current.version + 1,
            lastRevisionId: currentRevision.id,
        };
        delete restored.deletedAt;
        delete restored.deletedBy;
        await writeArray(
            RECIPES_KEY,
            recipes.map((item) => (item.id === recipeId ? restored : item))
        );
    }

    async markAsCooked(householdId: string, userId: string, recipeId: string): Promise<void> {
        const recipes = (await readArray(RECIPES_KEY, householdId, "local-user")).map((item) =>
            normalizeRecipe(item, householdId, "local-user")
        );
        const current = recipes.find((item) => item.id === recipeId);
        if (!current) {
            throw new Error("Recept bestaat niet meer.");
        }
        const revision = await saveRevision(current, userId, "mark_cooked");
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
                        lastRevisionId: revision.id,
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
