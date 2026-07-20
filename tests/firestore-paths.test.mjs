import { describe, expect, it } from "vitest";
import {
    isRecipeDocumentPath,
    partitionMismatchPaths,
} from "../scripts/lib/firestore-paths.mjs";

describe("Firestore recovery paths", () => {
    it("telt alleen rechtstreekse receptdocumenten als recept", () => {
        expect(
            isRecipeDocumentPath(
                "households/household-a/recipes/recipe-a"
            )
        ).toBe(true);
        expect(
            isRecipeDocumentPath(
                "households/household-a/recipes/recipe-a/recipeRevisions/revision-a"
            )
        ).toBe(false);
        expect(
            isRecipeDocumentPath(
                "households/household-a/mealPlan/2026-07-20"
            )
        ).toBe(false);
    });

    it("rapporteert expliciet genegeerde afgeleide documenten apart", () => {
        expect(
            partitionMismatchPaths(
                [
                    "households/household-a/recipes/recipe-a",
                    "system/backupStatus",
                ],
                ["system/backupStatus"]
            )
        ).toEqual({
            relevant: ["households/household-a/recipes/recipe-a"],
            ignored: ["system/backupStatus"],
        });
    });
});
