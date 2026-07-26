import {
  BringShareItem,
  Ingredient,
  MealPlanEntry,
  Recipe,
} from "@/types";
import { MEAL_TYPE_ORDER } from "@/lib/meal-plan";
import {
  composeQuantityTextFromLegacy,
  parseQuantityText,
  toHumanQuantity,
} from "@/lib/utils/quantity";

const SHOPPING_PREFERENCE_STORAGE_PREFIX = "shopping:discarded:v2";

export interface MealIngredient {
  id: string;
  normalizedKey: string;
  name: string;
  quantityText: string;
  unit?: string;
  amount?: number;
  isNumeric: boolean;
}

export interface MealGroup {
  id: string;
  date: string;
  mealType: MealPlanEntry["mealType"];
  recipeId: string;
  title: string;
  servings: number;
  ingredients: MealIngredient[];
}

export interface MealBringStats {
  toBring: number;
  notToBring: number;
  allNotToBring: boolean;
}

export interface BringSelectionStats {
  byMeal: Map<string, MealBringStats>;
  totalIngredientRows: number;
  toBringIngredientRows: number;
  notToBringIngredientRows: number;
  fullyNotToBringMealCount: number;
}

export interface ShoppingPreferences {
  notToBringMealIds: string[];
  notToBringIngredientIds: string[];
  collapsedMealIds: string[];
}

export interface ShoppingPreferenceStoragePayload {
  notToBringMealIds?: string[];
  notToBringIngredientIds?: string[];
  collapsedMealIds?: string[];
  discardedMealIds?: string[];
  discardedIngredientIds?: string[];
}

function normalizedIngredientKey(
  name: string,
  mode: "numeric" | "text",
  value: string
): string {
  return `${name.toLowerCase().trim()}::${mode}::${value.toLowerCase().trim()}`;
}

function mealGroupId(
  entry: Pick<MealPlanEntry, "date" | "mealType" | "recipeId">
): string {
  return `${entry.date}::${entry.mealType}::${entry.recipeId}`;
}

function ingredientQuantityText(ingredient: Ingredient): string {
  if (ingredient.quantityText?.trim()) {
    return ingredient.quantityText.trim();
  }

  const legacy = ingredient as Ingredient & { amount?: number; unit?: string };
  return composeQuantityTextFromLegacy(
    typeof legacy.amount === "number" ? legacy.amount : 0,
    typeof legacy.unit === "string" ? legacy.unit : ""
  );
}

function buildMealIngredients(
  groupId: string,
  recipe: Recipe,
  servings: number
): MealIngredient[] {
  const scaling = servings / recipe.baseServings;
  const ingredients = new Map<string, MealIngredient>();

  recipe.ingredients.forEach((ingredient) => {
    const quantityText = ingredientQuantityText(ingredient);
    const parsedQuantity = parseQuantityText(quantityText);

    if (parsedQuantity.isParseable && parsedQuantity.amount !== undefined) {
      const unit = parsedQuantity.unit ?? "";
      const normalizedKey = normalizedIngredientKey(
        ingredient.name,
        "numeric",
        unit
      );
      const existing = ingredients.get(normalizedKey);
      const scaledAmount = parsedQuantity.amount * scaling;

      if (existing?.amount !== undefined) {
        existing.amount += scaledAmount;
        return;
      }

      ingredients.set(normalizedKey, {
        id: `${groupId}::${normalizedKey}`,
        normalizedKey,
        name: ingredient.name,
        quantityText: "",
        unit,
        amount: scaledAmount,
        isNumeric: true,
      });
      return;
    }

    const normalizedKey = normalizedIngredientKey(
      ingredient.name,
      "text",
      quantityText
    );
    if (!ingredients.has(normalizedKey)) {
      ingredients.set(normalizedKey, {
        id: `${groupId}::${normalizedKey}`,
        normalizedKey,
        name: ingredient.name,
        quantityText,
        isNumeric: false,
      });
    }
  });

  return Array.from(ingredients.values()).sort((left, right) =>
    left.name.localeCompare(right.name, "nl-NL")
  );
}

export function buildMealGroups(
  mealPlan: MealPlanEntry[],
  recipes: Recipe[],
  includesEntry: (entry: MealPlanEntry) => boolean = () => true
): MealGroup[] {
  const recipesById = new Map(recipes.map((recipe) => [recipe.id, recipe]));

  return mealPlan
    .filter(includesEntry)
    .flatMap((entry): MealGroup[] => {
      const recipe = recipesById.get(entry.recipeId);
      if (!recipe) {
        return [];
      }

      const id = mealGroupId(entry);
      return [{
        id,
        date: entry.date,
        mealType: entry.mealType,
        recipeId: entry.recipeId,
        title: recipe.title,
        servings: entry.servings,
        ingredients: buildMealIngredients(id, recipe, entry.servings),
      }];
    })
    .sort((left, right) => {
      if (left.date !== right.date) {
        return left.date.localeCompare(right.date);
      }

      const mealTypeDifference =
        MEAL_TYPE_ORDER[left.mealType] - MEAL_TYPE_ORDER[right.mealType];
      return mealTypeDifference || left.title.localeCompare(right.title, "nl-NL");
    });
}

export function aggregateBringItems(
  mealGroups: MealGroup[],
  notToBringMealIds: ReadonlySet<string> = new Set(),
  notToBringIngredientIds: ReadonlySet<string> = new Set()
): BringShareItem[] {
  const items = new Map<string, BringShareItem>();

  mealGroups.forEach((group) => {
    if (notToBringMealIds.has(group.id)) {
      return;
    }

    group.ingredients.forEach((ingredient) => {
      if (notToBringIngredientIds.has(ingredient.id)) {
        return;
      }

      const existing = items.get(ingredient.normalizedKey);
      if (existing) {
        if (existing.amount !== undefined && ingredient.amount !== undefined) {
          existing.amount += ingredient.amount;
        }
        return;
      }

      items.set(ingredient.normalizedKey, {
        name: ingredient.name,
        ...(ingredient.isNumeric && ingredient.amount !== undefined
          ? { amount: ingredient.amount, unit: ingredient.unit ?? "" }
          : { quantityText: ingredient.quantityText }),
      });
    });
  });

  return Array.from(items.values()).sort((left, right) =>
    left.name.localeCompare(right.name, "nl-NL")
  );
}

export function getBringSelectionStats(
  mealGroups: MealGroup[],
  notToBringMealIds: ReadonlySet<string>,
  notToBringIngredientIds: ReadonlySet<string>
): BringSelectionStats {
  const byMeal = new Map<string, MealBringStats>();
  let totalIngredientRows = 0;
  let toBringIngredientRows = 0;
  let fullyNotToBringMealCount = 0;

  mealGroups.forEach((group) => {
    const entireMealExcluded = notToBringMealIds.has(group.id);
    const toBring = group.ingredients.reduce(
      (count, ingredient) =>
        count +
        Number(
          !entireMealExcluded &&
            !notToBringIngredientIds.has(ingredient.id)
        ),
      0
    );
    const notToBring = group.ingredients.length - toBring;
    const allNotToBring = group.ingredients.length > 0 && toBring === 0;

    totalIngredientRows += group.ingredients.length;
    toBringIngredientRows += toBring;
    fullyNotToBringMealCount += Number(allNotToBring);
    byMeal.set(group.id, { toBring, notToBring, allNotToBring });
  });

  return {
    byMeal,
    totalIngredientRows,
    toBringIngredientRows,
    notToBringIngredientRows: totalIngredientRows - toBringIngredientRows,
    fullyNotToBringMealCount,
  };
}

export function toBringQuantityText(item: BringShareItem): string {
  if (item.quantityText?.trim()) {
    return item.quantityText.trim();
  }

  return item.amount === undefined
    ? ""
    : toHumanQuantity(item.amount, item.unit ?? "").displayWithUnit.trim();
}

export function buildShoppingPreferenceStorageKey(
  householdId: string,
  weekStartKey: string
): string {
  return `${SHOPPING_PREFERENCE_STORAGE_PREFIX}:${householdId}:${weekStartKey}`;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function parseShoppingPreferences(
  payload: ShoppingPreferenceStoragePayload | null
): ShoppingPreferences {
  if (!payload) {
    return {
      notToBringMealIds: [],
      notToBringIngredientIds: [],
      collapsedMealIds: [],
    };
  }

  return {
    notToBringMealIds: stringArray(
      payload.notToBringMealIds ?? payload.discardedMealIds
    ),
    notToBringIngredientIds: stringArray(
      payload.notToBringIngredientIds ?? payload.discardedIngredientIds
    ),
    collapsedMealIds: stringArray(payload.collapsedMealIds),
  };
}

export function serializeShoppingPreferences(
  preferences: ShoppingPreferences
): ShoppingPreferenceStoragePayload {
  return {
    ...preferences,
    discardedMealIds: preferences.notToBringMealIds,
    discardedIngredientIds: preferences.notToBringIngredientIds,
  };
}
