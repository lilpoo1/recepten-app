import RecipeForm from "@/components/RecipeForm";

export default function NewRecipePage() {
    return (
        <div className="bg-gray-50 min-h-screen">
            <div className="bg-white shadow px-4 py-3 flex items-center gap-4 sticky top-0 z-10">
                <h1 className="text-lg font-bold">Nieuw Recept</h1>
            </div>
            <RecipeForm />
        </div>
    );
}
