"use client";

import Link from "next/link";
import { useStore } from "@/context/StoreContext";
import RecipeCard from "@/components/RecipeCard";
import SortControls from "@/components/SortControls";
import { useState } from "react";
import { SortOption } from "@/types";

export default function Home() {
  const { recipes } = useStore();
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>("name");

  const filteredRecipes = recipes
    .filter((r) =>
      r.title.toLowerCase().includes(searchTerm.toLowerCase())
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
    <div className="p-4 space-y-4 pb-24">
      <header className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">Mijn Recepten</h1>
        <div className="flex items-center gap-3">
          <Link href="/household/manage" className="text-xs font-semibold text-gray-600">
            Huishouden
          </Link>
          <Link href="/recipes/new" className="text-green-600 font-bold text-xl">+</Link>
        </div>
      </header>

      <div className="space-y-2">
        <input
          type="text"
          placeholder="Zoek gerecht..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-gray-100 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        />
        <SortControls currentSort={sortOption} onSortChange={setSortOption} />
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filteredRecipes.length > 0 ? (
          filteredRecipes.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} />
          ))
        ) : (
          <div className="bg-white p-6 rounded-lg shadow border border-gray-100 text-center py-12">
            <p className="text-gray-500 mb-4">Nog geen recepten gevonden.</p>
            <Link
              href="/recipes/new"
              className="px-6 py-2 bg-green-600 text-white rounded-full font-medium shadow hover:bg-green-700 transition"
            >
              + Nieuw Recept
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
