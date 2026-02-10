"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useStore } from "@/context/StoreContext";

export default function RecipeDetailClient({ id }: { id: string }) {
    const { getRecipeById, deleteRecipe } = useStore();
    const router = useRouter();
    const recipe = getRecipeById(id);
    const [servings, setServings] = useState<number>(recipe?.baseServings || 2);

    if (!recipe) {
        return (
            <div className="p-8 text-center text-gray-500">
                Recept niet gevonden.
                <Link href="/" className="mt-4 block text-green-600">
                    Terug naar overzicht
                </Link>
            </div>
        );
    }

    const handleDelete = async () => {
        if (!confirm("Weet je zeker dat je dit recept wilt verwijderen?")) {
            return;
        }
        await deleteRecipe(recipe.id);
        router.push("/");
    };

    const scalingFactor = servings / recipe.baseServings;

    return (
        <div className="min-h-screen bg-white pb-24">
            <div className="relative h-64 bg-gray-200">
                {recipe.image ? (
                    <Image
                        src={recipe.image}
                        alt={recipe.title}
                        fill
                        sizes="100vw"
                        unoptimized
                        className="object-cover"
                    />
                ) : (
                    <div className="flex h-full w-full items-center justify-center text-gray-400">
                        <span className="text-6xl">R</span>
                    </div>
                )}
                <div className="absolute left-4 top-4">
                    <Link href="/" className="rounded-full bg-white/80 p-2 shadow backdrop-blur-sm">
                        {"<"}
                    </Link>
                </div>
                <div className="absolute right-4 top-4 flex gap-2">
                    <button
                        onClick={() => void handleDelete()}
                        className="rounded-full bg-white/80 px-3 py-2 text-sm text-red-600 shadow backdrop-blur-sm"
                    >
                        Verwijder
                    </button>
                </div>
            </div>

            <div className="relative -mt-6 rounded-t-3xl bg-white p-4">
                <div className="mb-2 flex items-start justify-between">
                    <h1 className="flex-1 text-2xl font-bold text-gray-900">{recipe.title}</h1>
                    <div className="rounded bg-yellow-100 px-2 py-1 text-sm font-medium text-yellow-800">
                        {recipe.difficulty ?? "-"} / 5
                    </div>
                </div>

                <div className="mb-4 flex items-center space-x-4 text-sm text-gray-500">
                    <span>Tijd {recipe.prepTimeMinutes ?? "-"} min</span>
                    <span>
                        Laatst gegeten:{" "}
                        {recipe.cookingHistory.length > 0
                            ? new Date(Math.max(...recipe.cookingHistory)).toLocaleDateString("nl-NL")
                            : "Nog niet"}
                    </span>
                </div>

                <div className="mb-6 flex flex-wrap gap-2">
                    {recipe.tags.map((tag) => (
                        <span
                            key={tag}
                            className="rounded-lg bg-green-50 px-2 py-1 text-xs font-medium text-green-700"
                        >
                            {tag}
                        </span>
                    ))}
                </div>

                <hr className="mb-6 border-gray-100" />

                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-bold">Ingredienten</h2>
                    <div className="flex items-center rounded-lg bg-gray-100 p-1">
                        <button
                            onClick={() => setServings(Math.max(1, servings - 1))}
                            className="flex h-8 w-8 items-center justify-center rounded bg-white font-bold text-green-600 shadow-sm"
                        >
                            -
                        </button>
                        <span className="px-3 text-sm font-medium">{servings} pers.</span>
                        <button
                            onClick={() => setServings(servings + 1)}
                            className="flex h-8 w-8 items-center justify-center rounded bg-white font-bold text-green-600 shadow-sm"
                        >
                            +
                        </button>
                    </div>
                </div>

                <ul className="mb-8 space-y-2">
                    {recipe.ingredients.map((ingredient, index) => (
                        <li
                            key={`${ingredient.name}-${index}`}
                            className="flex justify-between border-b border-gray-50 pb-2 text-sm"
                        >
                            <span className="font-medium text-gray-900">
                                {ingredient.amount > 0
                                    ? (ingredient.amount * scalingFactor).toLocaleString("nl-NL", {
                                        maximumFractionDigits: 1,
                                    })
                                    : ""}{" "}
                                {ingredient.unit}
                            </span>
                            <span className="text-gray-600">{ingredient.name}</span>
                        </li>
                    ))}
                </ul>

                <h2 className="mb-4 text-lg font-bold">Bereiding</h2>
                <div className="space-y-6">
                    {recipe.steps.map((step, index) => (
                        <div key={`${step}-${index}`} className="flex gap-4">
                            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-green-100 text-sm font-bold text-green-600">
                                {index + 1}
                            </div>
                            <p className="mt-1 text-sm leading-relaxed text-gray-700">{step}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
