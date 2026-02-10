import RecipeDetailClient from "./RecipeDetailClient";

// Recipe data is client-side and household scoped.
export function generateStaticParams() {
    return [];
}

export default async function RecipeDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <RecipeDetailClient id={id} />;
}
