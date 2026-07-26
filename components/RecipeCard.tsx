import Link from "next/link";
import Image from "next/image";
import { Recipe } from "@/types";

interface RecipeCardProps {
    recipe: Recipe;
    onAddToWeekMenu: (recipe: Recipe) => void;
}

export default function RecipeCard({ recipe, onAddToWeekMenu }: RecipeCardProps) {
    return (
        <article className="overflow-hidden rounded-lg border bg-white shadow-sm transition-shadow hover:shadow-md">
            <Link href={`/recipes/${recipe.id}`} className="block">
                {recipe.image ? (
                    <Image
                        src={recipe.image}
                        alt={recipe.title}
                        width={640}
                        height={256}
                        unoptimized
                        className="h-32 w-full object-cover"
                    />
                ) : (
                    <div className="flex h-32 w-full items-center justify-center bg-gray-100 text-gray-300">
                        <span className="text-4xl">R</span>
                    </div>
                )}
            </Link>
            <div className="flex items-start gap-3 p-3">
                <Link href={`/recipes/${recipe.id}`} className="min-w-0 flex-1 rounded focus:outline-none focus:ring-2 focus:ring-green-500">
                    <h3 className="truncate font-semibold text-gray-800">{recipe.title}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                        <span>Tijd {recipe.prepTimeMinutes ?? "-"}m</span>
                        <span>Moeilijkheid {recipe.difficulty ?? "-"}/5</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                        {recipe.tags.slice(0, 3).map((tag) => (
                            <span
                                key={tag}
                                className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] text-green-700"
                            >
                                {tag}
                            </span>
                        ))}
                    </div>
                </Link>
                <button
                    type="button"
                    onClick={() => onAddToWeekMenu(recipe)}
                    aria-label={`${recipe.title} aan weekmenu toevoegen`}
                    className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-green-600 bg-white px-3 text-xs font-bold text-green-700 transition hover:bg-green-50 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                >
                    + Weekmenu
                </button>
            </div>
        </article>
    );
}
