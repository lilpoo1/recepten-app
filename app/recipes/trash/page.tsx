"use client";

import Link from "next/link";
import { useState } from "react";
import { useStore } from "@/context/StoreContext";

export default function RecipeTrashPage() {
    const { deletedRecipes, restoreRecipe } = useStore();
    const [busyId, setBusyId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleRestore = async (recipeId: string) => {
        setBusyId(recipeId);
        setError(null);
        try {
            await restoreRecipe(recipeId);
        } catch (restoreError) {
            setError(
                restoreError instanceof Error
                    ? restoreError.message
                    : "Recept herstellen is mislukt."
            );
        } finally {
            setBusyId(null);
        }
    };

    return (
        <main className="space-y-4 p-4 pb-24">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Prullenbak</h1>
                    <p className="mt-1 text-sm text-gray-500">
                        Verwijderde recepten blijven 14 weken herstelbaar.
                    </p>
                </div>
                <Link href="/recipes" className="text-sm font-semibold text-green-700">
                    Terug
                </Link>
            </header>

            {error ? (
                <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
            ) : null}

            {deletedRecipes.length === 0 ? (
                <div className="rounded-lg border border-gray-100 bg-white p-8 text-center text-gray-500 shadow-sm">
                    De prullenbak is leeg.
                </div>
            ) : (
                <div className="space-y-3">
                    {deletedRecipes.map((recipe) => (
                        <article
                            key={recipe.id}
                            className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
                        >
                            <h2 className="font-semibold text-gray-900">{recipe.title}</h2>
                            <p className="mt-1 text-xs text-gray-500">
                                Verwijderd{" "}
                                {recipe.deletedAt
                                    ? new Date(recipe.deletedAt).toLocaleString("nl-NL")
                                    : "op onbekend moment"}
                            </p>
                            <div className="mt-4 flex gap-2">
                                <button
                                    type="button"
                                    disabled={busyId === recipe.id}
                                    onClick={() => void handleRestore(recipe.id)}
                                    className="rounded-full bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                                >
                                    {busyId === recipe.id ? "Herstellen..." : "Herstel recept"}
                                </button>
                                <Link
                                    href={`/recipes/${recipe.id}/history`}
                                    className="rounded-full border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700"
                                >
                                    Versies
                                </Link>
                            </div>
                        </article>
                    ))}
                </div>
            )}
        </main>
    );
}
