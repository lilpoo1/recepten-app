import Link from "next/link";
import Image from "next/image";
import { Recipe } from "@/types";

interface RecipeCardProps {
    recipe: Recipe;
}

export default function RecipeCard({ recipe }: RecipeCardProps) {
    return (
        <Link href={`/recipes/${recipe.id}`} className="block">
            <div className="overflow-hidden rounded-lg border bg-white shadow-sm transition-shadow hover:shadow-md">
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
                <div className="p-3">
                    <h3 className="truncate font-semibold text-gray-800">{recipe.title}</h3>
                    <div className="mt-1 flex items-center space-x-2 text-xs text-gray-500">
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
                </div>
            </div>
        </Link>
    );
}
