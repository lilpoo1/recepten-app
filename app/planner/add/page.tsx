"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { useStore } from "@/context/StoreContext";
import { MealType } from "@/types";

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
    const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
    const [servingsInput, setServingsInput] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    if (!date) {
        return <div className="p-4">Geen datum geselecteerd.</div>;
    }

    const filteredRecipes = recipes.filter((recipe) =>
        recipe.title.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const selectedRecipe = recipes.find((recipe) => recipe.id === selectedRecipeId) ?? null;

    const parsedServings = Number.parseInt(servingsInput, 10);
    const servingsValid = Number.isInteger(parsedServings) && parsedServings >= 1;

    const handleSelectRecipe = (recipeId: string) => {
        const recipe = recipes.find((item) => item.id === recipeId);
        if (!recipe) {
            return;
        }

        setSelectedRecipeId(recipe.id);
        setServingsInput(String(recipe.baseServings));
        setError(null);
    };

    const handleSave = async () => {
        if (!selectedRecipe) {
            setError("Selecteer eerst een recept.");
            return;
        }

        if (!servingsValid) {
            setError("Personen moet een geheel getal van minimaal 1 zijn.");
            return;
        }

        setBusy(true);
        setError(null);

        try {
            await addToMealPlan({
                date,
                recipeId: selectedRecipe.id,
                servings: parsedServings,
                mealType: selectedType,
            });
            router.push("/planner");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Opslaan mislukt.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            <div className="sticky top-0 z-10 space-y-3 bg-white px-4 py-3 shadow">
                <div className="flex items-center justify-between gap-3">
                    <h1 className="text-lg font-bold">Plan voor {date}</h1>
                    <div className="flex items-center gap-2">
                        <button onClick={() => router.back()} className="text-sm text-gray-500">
                            Annuleren
                        </button>
                        <button
                            type="button"
                            onClick={() => void handleSave()}
                            disabled={busy || !selectedRecipe || !servingsValid}
                            className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {busy ? "Opslaan..." : "Opslaan"}
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                    <div className="min-w-0">
                        <label className="mb-1 block text-xs text-gray-500">Type</label>
                        <select
                            value={selectedType}
                            onChange={(event) => {
                                setSelectedType(parseMealType(event.target.value));
                                setError(null);
                            }}
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
                            min={1}
                            value={servingsInput}
                            onChange={(event) => {
                                setServingsInput(event.target.value);
                                setError(null);
                            }}
                            className="w-full rounded bg-gray-100 p-2"
                        />
                    </div>
                </div>

                {selectedRecipe ? (
                    <p className="text-xs text-gray-600">
                        Geselecteerd: <span className="font-semibold">{selectedRecipe.title}</span>
                    </p>
                ) : (
                    <p className="text-xs text-gray-500">Selecteer een recept en klik daarna op Opslaan.</p>
                )}

                {error ? <p className="text-xs text-red-600">{error}</p> : null}

                <input
                    type="text"
                    placeholder="Zoek recept..."
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    className="w-full rounded bg-gray-100 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
            </div>

            <div className="space-y-3 p-4">
                {filteredRecipes.map((recipe) => {
                    const isSelected = recipe.id === selectedRecipeId;

                    return (
                        <button
                            key={recipe.id}
                            type="button"
                            onClick={() => handleSelectRecipe(recipe.id)}
                            className={`flex w-full cursor-pointer gap-3 rounded border p-3 text-left shadow-sm ${
                                isSelected
                                    ? "border-green-300 bg-green-50"
                                    : "border-gray-100 bg-white active:bg-green-50"
                            }`}
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
                                    Tijd {recipe.prepTimeMinutes ?? "-"}m | Moeilijkheid {recipe.difficulty ?? "-"} |
                                    Basis {recipe.baseServings} pers.
                                </div>
                            </div>
                            <div className="flex items-center px-2 text-sm font-semibold text-green-700">
                                {isSelected ? "Geselecteerd" : "Selecteer"}
                            </div>
                        </button>
                    );
                })}
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
