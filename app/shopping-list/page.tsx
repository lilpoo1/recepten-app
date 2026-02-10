"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { addDays, endOfWeek, isWithinInterval, startOfWeek } from "date-fns";
import { ShoppingItem } from "@/types";
import { useStore } from "@/context/StoreContext";

export default function ShoppingListPage() {
    const { mealPlan, recipes } = useStore();
    const [startDate, setStartDate] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
    const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
    const endDate = endOfWeek(startDate, { weekStartsOn: 1 });

    const shoppingList = useMemo(() => {
        const items: Record<string, ShoppingItem> = {};

        mealPlan.forEach((entry) => {
            const entryDate = new Date(entry.date);
            if (!isWithinInterval(entryDate, { start: startDate, end: endDate })) {
                return;
            }

            const recipe = recipes.find((item) => item.id === entry.recipeId);
            if (!recipe) {
                return;
            }

            const scaling = entry.servings / recipe.baseServings;
            recipe.ingredients.forEach((ingredient) => {
                const key = `${ingredient.name.toLowerCase().trim()}-${ingredient.unit
                    .toLowerCase()
                    .trim()}`;
                if (items[key]) {
                    items[key].amount += ingredient.amount * scaling;
                } else {
                    items[key] = {
                        name: ingredient.name,
                        amount: ingredient.amount * scaling,
                        unit: ingredient.unit,
                        checked: false,
                    };
                }
            });
        });

        return Object.values(items).sort((a, b) => a.name.localeCompare(b.name));
    }, [endDate, mealPlan, recipes, startDate]);

    const toggleCheck = (name: string) => {
        const nextChecked = new Set(checkedItems);
        if (nextChecked.has(name)) {
            nextChecked.delete(name);
        } else {
            nextChecked.add(name);
        }
        setCheckedItems(nextChecked);
    };

    const nextWeek = () => setStartDate(addDays(startDate, 7));
    const prevWeek = () => setStartDate(addDays(startDate, -7));

    return (
        <div className="min-h-screen bg-gray-50 pb-24">
            <div className="sticky top-0 z-10 flex items-center justify-between bg-white px-4 py-3 shadow">
                <button onClick={prevWeek} className="p-2 text-gray-600">
                    {"<"}
                </button>
                <h1 className="text-lg font-bold">Boodschappen</h1>
                <button onClick={nextWeek} className="p-2 text-gray-600">
                    {">"}
                </button>
            </div>

            <div className="p-4">
                {shoppingList.length === 0 ? (
                    <div className="py-10 text-center text-gray-500">
                        Geen boodschappen voor deze week.
                        <Link href="/planner" className="mt-4 block font-bold text-green-600">
                            Plan maaltijden
                        </Link>
                    </div>
                ) : (
                    <>
                        <div className="mb-6 overflow-hidden rounded-lg bg-white shadow-sm">
                            {shoppingList.map((item) => {
                                const key = `${item.name}-${item.unit}`;
                                const isChecked = checkedItems.has(key);
                                return (
                                    <button
                                        type="button"
                                        key={key}
                                        onClick={() => toggleCheck(key)}
                                        className={`flex w-full cursor-pointer items-center border-b border-gray-100 p-3 text-left last:border-0 ${isChecked ? "bg-gray-50" : ""
                                            }`}
                                    >
                                        <div
                                            className={`mr-3 flex h-5 w-5 items-center justify-center rounded border ${isChecked ? "border-green-500 bg-green-500" : "border-gray-300"
                                                }`}
                                        >
                                            {isChecked ? <span className="text-xs text-white">v</span> : null}
                                        </div>
                                        <div className={isChecked ? "text-gray-400 line-through" : "text-gray-800"}>
                                            <span className="mr-1 font-bold">
                                                {item.amount > 0 ? Number.parseFloat(item.amount.toFixed(1)) : ""} {item.unit}
                                            </span>
                                            <span>{item.name}</span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        <Link
                            href={`/shopping-list/export?start=${startDate.toISOString()}`}
                            className="block w-full rounded-lg bg-red-600 py-3 text-center font-bold text-white shadow hover:bg-red-700"
                        >
                            Genereer Bring-link
                        </Link>
                    </>
                )}
            </div>
        </div>
    );
}
