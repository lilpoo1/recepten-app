import type { MealType } from "@/types";

export const MEAL_TYPES: readonly MealType[] = ["dinner", "lunch", "other"];

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
    dinner: "Diner",
    lunch: "Lunch",
    other: "Anders",
};

export function normalizeRecipeMealTypes(value: unknown): MealType[] {
    if (!Array.isArray(value)) {
        return ["dinner"];
    }

    const normalized = Array.from(
        new Set(
            value.filter(
                (item): item is MealType =>
                    item === "dinner" || item === "lunch" || item === "other"
            )
        )
    );

    return normalized.length > 0 ? normalized : ["dinner"];
}
