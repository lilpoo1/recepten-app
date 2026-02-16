"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import RecipeForm from "@/components/RecipeForm";
import { useStore } from "@/context/StoreContext";

export default function EditRecipePage() {
    const params = useParams<{ id: string }>();
    const idParam = params?.id;
    const id = Array.isArray(idParam) ? idParam[0] : idParam;
    const { isReady, household, recipes, getRecipeById } = useStore();
    const recipe = id ? getRecipeById(id) : undefined;

    if (!id) {
        return (
            <div className="p-8 text-center text-gray-500">
                Ongeldige recipe-link.
                <Link href="/recipes" className="mt-4 block text-green-600">
                    Terug naar overzicht
                </Link>
            </div>
        );
    }

    if (!isReady || !household || (!recipe && recipes.length === 0)) {
        return (
            <div className="p-8 text-center text-gray-500">
                Recept laden...
            </div>
        );
    }

    if (!recipe) {
        return (
            <div className="p-8 text-center text-gray-500">
                Recept niet gevonden.
                <Link href="/recipes" className="mt-4 block text-green-600">
                    Terug naar overzicht
                </Link>
            </div>
        );
    }

    return (
        <div className="bg-gray-50 min-h-screen">
            <div className="bg-white shadow px-4 py-3 flex items-center justify-between gap-4 sticky top-0 z-10">
                <h1 className="text-lg font-bold">Recept bewerken</h1>
                <Link href={`/recipes/${recipe.id}`} className="text-sm text-gray-600">
                    Annuleer
                </Link>
            </div>
            <RecipeForm initialRecipe={recipe} />
        </div>
    );
}
