import { describe, expect, it } from "vitest";
import {
    buildBringDeeplink,
    formatBringIngredient,
    toBringRecipeJsonLd,
} from "@/lib/bring/import";
import type { BringShareSnapshot } from "@/types";

function createSnapshot(
    overrides: Partial<BringShareSnapshot> = {}
): BringShareSnapshot {
    return {
        token: "token",
        householdId: "household-1",
        createdBy: "user-1",
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
        title: "Boodschappen maandag",
        items: [{ name: "Tomaat", quantityText: "2 stuks" }],
        servings: 1,
        sourceWeekStart: "2026-07-27",
        ...overrides,
    };
}

describe("Bring import", () => {
    it("bouwt de ondersteunde Bring-deeplink met een volledig gecodeerde bron-URL", () => {
        const sourceUrl =
            "https://recepten.example/bring/share/token met spatie?naam=crème&week=1";

        expect(buildBringDeeplink(sourceUrl)).toBe(
            "https://api.getbring.com/rest/bringrecipes/deeplink" +
                "?url=https%3A%2F%2Frecepten.example%2Fbring%2Fshare%2Ftoken%20met%20spatie%3Fnaam%3Dcr%C3%A8me%26week%3D1" +
                "&source=web&baseQuantity=1&requestedQuantity=1"
        );
    });

    it("maakt geldige Recipe JSON-LD met getrimde ingrediënten en hoeveelheden", () => {
        const snapshot = createSnapshot({
            title: " Boodschappen maandag ",
            items: [
                { name: " Tomaat ", quantityText: " 2 stuks " },
                { name: "Brood" },
                { name: " " },
            ],
        });

        expect(toBringRecipeJsonLd(snapshot)).toEqual({
            "@context": "https://schema.org",
            "@type": "Recipe",
            name: "Boodschappen maandag",
            author: {
                "@type": "Organization",
                name: "ReceptenApp",
            },
            recipeYield: "1 lijst",
            recipeIngredient: ["2 stuks Tomaat", "Brood"],
        });
    });

    it("gebruikt een niet-lege receptnaam als de snapshottitel leeg is", () => {
        const snapshot = createSnapshot({ title: "   " });

        expect(toBringRecipeJsonLd(snapshot).name).toBe("Boodschappenlijst");
    });

    it("laat een ingrediënt zonder naam weg", () => {
        expect(formatBringIngredient({ name: " ", quantityText: "2 stuks" })).toBe("");
    });
});
