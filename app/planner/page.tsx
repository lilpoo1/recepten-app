"use client";

import Link from "next/link";
import { useState } from "react";
import { addDays, format, isSameDay, startOfWeek } from "date-fns";
import { nl } from "date-fns/locale";
import { useStore } from "@/context/StoreContext";

export default function PlannerPage() {
    const { mealPlan, recipes, removeFromMealPlan, markAsCooked } = useStore();
    const [currentDate, setCurrentDate] = useState(new Date());

    const startDate = startOfWeek(currentDate, { weekStartsOn: 1 });
    const days = Array.from({ length: 7 }, (_, index) => addDays(startDate, index));

    const getMealsForDay = (date: Date) =>
        mealPlan.filter((entry) => isSameDay(new Date(entry.date), date));

    const getRecipeName = (id: string) =>
        recipes.find((recipe) => recipe.id === id)?.title || "Onbekend recept";

    const handleCooked = async (recipeId: string, title: string) => {
        if (!confirm(`Markeer '${title}' als gekookt?`)) {
            return;
        }
        await markAsCooked(recipeId);
    };

    const nextWeek = () => setCurrentDate(addDays(currentDate, 7));
    const prevWeek = () => setCurrentDate(addDays(currentDate, -7));

    return (
        <div className="min-h-screen bg-gray-50 pb-24">
            <div className="sticky top-0 z-10 flex items-center justify-between bg-white px-4 py-3 shadow">
                <button onClick={prevWeek} className="p-2 text-gray-600">
                    {"<"}
                </button>
                <span className="text-lg font-bold capitalize">
                    {format(startDate, "MMMM yyyy", { locale: nl })}
                </span>
                <button onClick={nextWeek} className="p-2 text-gray-600">
                    {">"}
                </button>
            </div>

            <div className="space-y-4 p-4">
                {days.map((day) => {
                    const meals = getMealsForDay(day);
                    const dateStr = format(day, "yyyy-MM-dd");

                    return (
                        <div
                            key={dateStr}
                            className="overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm"
                        >
                            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-2">
                                <span className="font-semibold capitalize text-gray-700">
                                    {format(day, "EEEE d MMM", { locale: nl })}
                                </span>
                                <Link
                                    href={`/planner/add?date=${dateStr}`}
                                    className="px-2 text-xl font-bold leading-none text-green-600"
                                >
                                    +
                                </Link>
                            </div>
                            <div className="space-y-2 p-2">
                                {meals.length === 0 ? (
                                    <p className="py-2 text-center text-xs text-gray-400">Nog niets gepland</p>
                                ) : (
                                    meals.map((meal) => {
                                        const title = getRecipeName(meal.recipeId);
                                        return (
                                            <div
                                                key={`${meal.date}-${meal.recipeId}-${meal.mealType}`}
                                                className="group flex items-center justify-between rounded bg-green-50 p-2 text-sm"
                                            >
                                                <div className="flex flex-1 flex-col">
                                                    <span className="font-medium text-gray-800">{title}</span>
                                                    <span className="text-xs capitalize text-gray-500">
                                                        {meal.mealType === "other" ? "Anders" : meal.mealType} | {meal.servings} pers.
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        onClick={() => void handleCooked(meal.recipeId, title)}
                                                        className="rounded border border-green-200 bg-white px-2 py-1 text-xs text-green-600 shadow-sm hover:bg-green-100"
                                                        title="Markeer als gegeten"
                                                    >
                                                        Klaar
                                                    </button>
                                                    <button
                                                        onClick={() =>
                                                            void removeFromMealPlan(
                                                                meal.date,
                                                                meal.recipeId,
                                                                meal.mealType
                                                            )
                                                        }
                                                        className="px-2 font-bold text-gray-400 hover:text-red-500"
                                                    >
                                                        x
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
