"use client";

import Link from "next/link";
import { useState } from "react";
import { useStore } from "@/context/StoreContext";
import RecipeCard from "@/components/RecipeCard";
import SortControls from "@/components/SortControls";
import { SortOption } from "@/types";

export default function RecipesPage() {
    const { recipes } = useStore();
    const [searchTerm, setSearchTerm] = useState("");
    const [sortOption, setSortOption] = useState<SortOption>("name");

    const filteredRecipes = recipes
        .filter((recipe) =>
            recipe.title.toLowerCase().includes(searchTerm.toLowerCase())
        )
        .sort((a, b) => {
            switch (sortOption) {
                case "name":
                    return a.title.localeCompare(b.title);
                case "created":
                    return b.createdAt - a.createdAt;
                case "time":
                    return (a.prepTimeMinutes || 0) - (b.prepTimeMinutes || 0);
                case "last_eaten":
                    const lastA = a.cookingHistory?.length ? Math.max(...a.cookingHistory) : 0;
                    const lastB = b.cookingHistory?.length ? Math.max(...b.cookingHistory) : 0;
                    return lastA - lastB;
                default:
                    return 0;
            }
        });

    return (
        <>
            <div className="space-y-4 p-4 pb-40">
                <header className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold text-gray-800">Mijn Recepten</h1>
                    <Link href="/household/manage" className="text-xs font-semibold text-gray-600">
                        Huishouden
                    </Link>
                </header>

                <div className="space-y-2">
                    <input
                        type="text"
                        placeholder="Zoek gerecht..."
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        className="w-full rounded-lg bg-gray-100 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                    <SortControls currentSort={sortOption} onSortChange={setSortOption} />
                </div>

                <div className="grid grid-cols-1 gap-4">
                    {filteredRecipes.length > 0 ? (
                        filteredRecipes.map((recipe) => (
                            <RecipeCard key={recipe.id} recipe={recipe} />
                        ))
                    ) : (
                        <div className="rounded-lg border border-gray-100 bg-white p-6 py-12 text-center shadow">
                            <p className="text-gray-500">Nog geen recepten gevonden.</p>
                        </div>
                    )}
                </div>
            </div>

            <div
                className="pointer-events-none fixed left-0 right-0 z-40"
                style={{ bottom: "calc(5rem + env(safe-area-inset-bottom, 0px))" }}
            >
                <div className="mx-auto flex w-full max-w-md justify-end px-4">
                    <Link
                        href="/recipes/new"
                        className="pointer-events-auto inline-flex min-h-12 items-center rounded-full bg-green-600 px-5 text-sm font-semibold text-white shadow-lg transition hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                    >
                        + Recept
                    </Link>
                </div>
            </div>
        </>
    );
}
