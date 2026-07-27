import type { BringShareItem, BringShareSnapshot } from "@/types";

const BRING_DEEPLINK_URL = "https://api.getbring.com/rest/bringrecipes/deeplink";

export interface BringRecipeJsonLd {
    "@context": "https://schema.org";
    "@type": "Recipe";
    name: string;
    author: {
        "@type": "Organization";
        name: "ReceptenApp";
    };
    recipeYield: string;
    recipeIngredient: string[];
}

export function buildBringDeeplink(sourceUrl: string): string {
    return `${BRING_DEEPLINK_URL}?url=${encodeURIComponent(
        sourceUrl
    )}&source=web&baseQuantity=1&requestedQuantity=1`;
}

export function formatBringIngredient(item: BringShareItem): string {
    const name = item.name.trim();
    if (!name) {
        return "";
    }

    const quantityText = (item.quantityText ?? "").trim();
    return quantityText ? `${quantityText} ${name}` : name;
}

export function toBringRecipeJsonLd(snapshot: BringShareSnapshot): BringRecipeJsonLd {
    const recipeIngredient = snapshot.items
        .map((item) => formatBringIngredient(item))
        .filter((item) => item.length > 0);

    return {
        "@context": "https://schema.org",
        "@type": "Recipe",
        name: snapshot.title.trim() || "Boodschappenlijst",
        author: {
            "@type": "Organization",
            name: "ReceptenApp",
        },
        recipeYield: `${snapshot.servings} lijst`,
        recipeIngredient,
    };
}
