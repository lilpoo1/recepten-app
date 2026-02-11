"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { useStore } from "@/context/StoreContext";
import { MealType, Recipe } from "@/types";

function parseMealType(value: string): MealType {
    if (value === "lunch" || value === "other") {
        return value;
    }
    return "dinner";
}

function AddRecipeContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const date = searchParams.get("date");
    const { recipes, addToMealPlan } = useStore();
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedType, setSelectedType] = useState<MealType>("dinner");
    const [servings, setServings] = useState(2);

    if (!date) {
        return <div className="p-4">Geen datum geselecteerd.</div>;
    }

    const handleSelect = async (recipe: Recipe) => {
        await addToMealPlan({
            date,
            recipeId: recipe.id,
            servings,
            mealType: selectedType,
        });
        router.push("/planner");
    };

    const filteredRecipes = recipes.filter((recipe) =>
        recipe.title.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            <div className="sticky top-0 z-10 space-y-3 bg-white px-4 py-3 shadow">
                <div className="flex items-center justify-between">
                    <h1 className="text-lg font-bold">Plan voor {date}</h1>
                    <button onClick={() => router.back()} className="text-sm text-gray-500">
                        Annuleren
                    </button>
                </div>

                <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                    <div className="min-w-0">
                        <label className="mb-1 block text-xs text-gray-500">Type</label>
                        <select
                            value={selectedType}
                            onChange={(event) => setSelectedType(parseMealType(event.target.value))}
                            className="w-full rounded bg-gray-100 p-2"
                        >
                            <option value="dinner">Diner</option>
                            <option value="lunch">Lunch</option>
                            <option value="other">Anders</option>
                        </select>
                    </div>
                    <div className="min-w-0">
                        <label className="mb-1 block text-xs text-gray-500">Personen</label>
                        <input
                            type="number"
                            value={servings}
                            min={1}
                            onChange={(event) => setServings(Number.parseInt(event.target.value, 10) || 1)}
                            className="w-full rounded bg-gray-100 p-2"
                        />
                    </div>
                </div>

                <input
                    type="text"
                    placeholder="Zoek recept..."
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    className="w-full rounded bg-gray-100 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
            </div>

            <div className="space-y-3 p-4">
                {filteredRecipes.map((recipe) => (
                    <button
                        key={recipe.id}
                        type="button"
                        onClick={() => void handleSelect(recipe)}
                        className="flex w-full cursor-pointer gap-3 rounded border border-gray-100 bg-white p-3 text-left shadow-sm active:bg-green-50"
                    >
                        {recipe.image ? (
                            <Image
                                src={recipe.image}
                                alt={recipe.title}
                                width={64}
                                height={64}
                                unoptimized
                                className="h-16 w-16 rounded bg-gray-200 object-cover"
                            />
                        ) : (
                            <div className="flex h-16 w-16 items-center justify-center rounded bg-gray-100 text-xl">
                                R
                            </div>
                        )}
                        <div className="flex-1">
                            <h3 className="font-semibold text-gray-800">{recipe.title}</h3>
                            <div className="mt-1 text-xs text-gray-500">
                                Tijd {recipe.prepTimeMinutes ?? "-"}m | Moeilijkheid {recipe.difficulty ?? "-"}
                            </div>
                        </div>
                        <div className="flex items-center px-2 text-xl font-bold text-green-600">+</div>
                    </button>
                ))}
            </div>
        </div>
    );
}

export default function AddRecipePage() {
    return (
        <Suspense fallback={<div className="p-4">Laden...</div>}>
            <AddRecipeContent />
        </Suspense>
    );
}
