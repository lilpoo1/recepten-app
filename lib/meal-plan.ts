import { MealType } from "@/types";

export const MEAL_TYPE_ORDER: Record<MealType, number> = {
  lunch: 0,
  dinner: 1,
  other: 2,
};

export const MEAL_TYPE_LABEL: Record<MealType, string> = {
  lunch: "Lunch",
  dinner: "Diner",
  other: "Anders",
};

export function parseMealType(value: string): MealType {
  return value === "lunch" || value === "other" ? value : "dinner";
}
