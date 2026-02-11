"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/context/StoreContext";
import { Ingredient, Recipe } from "@/types";

export default function RecipeForm({ initialRecipe }: { initialRecipe?: Recipe }) {
    const { addRecipe, updateRecipe } = useStore();
    const router = useRouter();

    const [title, setTitle] = useState(initialRecipe?.title ?? "");
    const [prepTime, setPrepTime] = useState(initialRecipe?.prepTimeMinutes ?? 30);
    const [difficulty, setDifficulty] = useState(initialRecipe?.difficulty ?? 3);
    const [baseServings, setBaseServings] = useState(initialRecipe?.baseServings ?? 2);
    const [ingredients, setIngredients] = useState<Ingredient[]>(initialRecipe?.ingredients ?? []);
    const [steps, setSteps] = useState<string[]>(initialRecipe?.steps ?? []);
    const [newIngredient, setNewIngredient] = useState({ name: "", amount: "", unit: "" });
    const [newStep, setNewStep] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);
        setBusy(true);

        try {
            if (initialRecipe) {
                await updateRecipe({
                    ...initialRecipe,
                    title,
                    ingredients,
                    steps,
                    prepTimeMinutes: prepTime,
                    difficulty,
                    baseServings,
                    updatedAt: Date.now(),
                });
            } else {
                await addRecipe({
                    title,
                    description: "",
                    ingredients,
                    steps,
                    prepTimeMinutes: prepTime,
                    difficulty,
                    tags: [],
                    baseServings,
                    notes: "",
                    image: undefined,
                });
            }
            router.push("/");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Opslaan mislukt.");
        } finally {
            setBusy(false);
        }
    };

    const addIngredient = () => {
        if (!newIngredient.name || !newIngredient.amount) {
            return;
        }

        setIngredients((prev) => [
            ...prev,
            {
                name: newIngredient.name,
                amount: Number.parseFloat(newIngredient.amount),
                unit: newIngredient.unit,
            },
        ]);
        setNewIngredient({ name: "", amount: "", unit: "" });
    };

    const addStep = () => {
        if (!newStep.trim()) {
            return;
        }
        setSteps((prev) => [...prev, newStep.trim()]);
        setNewStep("");
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6 p-4 pb-20">
            <div>
                <label className="block text-sm font-medium text-gray-700">Titel</label>
                <input
                    type="text"
                    required
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm"
                />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                    <label className="block text-sm font-medium text-gray-700">Tijd (min)</label>
                    <input
                        type="number"
                        value={prepTime}
                        min={1}
                        onChange={(event) => setPrepTime(Number.parseInt(event.target.value, 10) || 1)}
                        className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Moeilijkheid</label>
                    <select
                        value={difficulty}
                        onChange={(event) =>
                            setDifficulty(Number.parseInt(event.target.value, 10) as 1 | 2 | 3 | 4 | 5)
                        }
                        className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm"
                    >
                        {[1, 2, 3, 4, 5].map((value) => (
                            <option key={value} value={value}>
                                {value}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Personen</label>
                    <input
                        type="number"
                        value={baseServings}
                        min={1}
                        onChange={(event) =>
                            setBaseServings(Number.parseInt(event.target.value, 10) || 1)
                        }
                        className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm"
                    />
                </div>
            </div>

            <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Ingredienten</label>
                <div className="mb-2 space-y-2">
                    {ingredients.map((ingredient, index) => (
                        <div
                            key={`${ingredient.name}-${index}`}
                            className="flex items-start justify-between gap-2 rounded bg-gray-50 p-2 text-sm"
                        >
                            <span className="min-w-0 break-words">
                                {ingredient.amount} {ingredient.unit} {ingredient.name}
                            </span>
                            <button
                                type="button"
                                onClick={() =>
                                    setIngredients((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
                                }
                                className="shrink-0 text-red-500"
                            >
                                x
                            </button>
                        </div>
                    ))}
                </div>
                <div className="space-y-2">
                    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)] gap-2">
                        <input
                            placeholder="Aantal"
                            type="number"
                            value={newIngredient.amount}
                            onChange={(event) =>
                                setNewIngredient((prev) => ({ ...prev, amount: event.target.value }))
                            }
                            className="w-full min-w-0 rounded-md border border-gray-300 p-2 text-sm shadow-sm"
                        />
                        <input
                            placeholder="Eenheid"
                            value={newIngredient.unit}
                            onChange={(event) =>
                                setNewIngredient((prev) => ({ ...prev, unit: event.target.value }))
                            }
                            className="w-full min-w-0 rounded-md border border-gray-300 p-2 text-sm shadow-sm"
                        />
                        <input
                            placeholder="Ingredient"
                            value={newIngredient.name}
                            onChange={(event) =>
                                setNewIngredient((prev) => ({ ...prev, name: event.target.value }))
                            }
                            className="w-full min-w-0 rounded-md border border-gray-300 p-2 text-sm shadow-sm"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={addIngredient}
                        className="w-full rounded-md bg-green-100 px-3 py-2 text-sm font-medium text-green-700"
                    >
                        Voeg ingredient toe
                    </button>
                </div>
            </div>

            <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Bereiding</label>
                <div className="mb-2 space-y-2">
                    {steps.map((step, index) => (
                        <div key={`${step}-${index}`} className="flex gap-2 rounded bg-gray-50 p-2 text-sm">
                            <span className="shrink-0 font-bold text-gray-400">{index + 1}.</span>
                            <p className="min-w-0 flex-1 break-words">{step}</p>
                            <button
                                type="button"
                                onClick={() =>
                                    setSteps((prev) => prev.filter((_, stepIndex) => stepIndex !== index))
                                }
                                className="shrink-0 text-red-500"
                            >
                                x
                            </button>
                        </div>
                    ))}
                </div>
                <div className="space-y-2">
                    <textarea
                        placeholder="Stap beschrijving..."
                        value={newStep}
                        onChange={(event) => setNewStep(event.target.value)}
                        className="w-full min-w-0 rounded-md border border-gray-300 p-2 text-sm shadow-sm"
                        rows={2}
                    />
                    <button
                        type="button"
                        onClick={addStep}
                        className="w-full rounded-md bg-green-100 px-3 py-2 text-sm font-medium text-green-700"
                    >
                        Voeg stap toe
                    </button>
                </div>
            </div>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <button
                type="submit"
                disabled={busy}
                className="w-full rounded-full bg-green-600 px-4 py-3 text-sm font-medium text-white shadow-sm hover:bg-green-700 disabled:opacity-60"
            >
                {busy ? "Opslaan..." : "Opslaan"}
            </button>
        </form>
    );
}
