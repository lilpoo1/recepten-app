import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Recipe } from "@/types";
import {
    persistHouseholdCache,
    persistShoppingPreferences,
    readHouseholdCache,
    readLocalValue,
    readShoppingPreferences,
} from "@/lib/storage/browser-storage";

class MemoryStorage {
    private readonly values = new Map<string, string>();

    getItem(key: string) {
        return this.values.get(key) ?? null;
    }

    setItem(key: string, value: string) {
        this.values.set(key, value);
    }

    removeItem(key: string) {
        this.values.delete(key);
    }
}

function deleteDatabase() {
    return new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase("recepten-app");
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => resolve();
    });
}

function recipe(image?: string): Recipe {
    return {
        id: "recipe-1",
        householdId: "household-1",
        createdBy: "user-1",
        title: "Testrecept",
        image,
        ingredients: [{ name: "Tomaat", quantityText: "2 stuks" }],
        baseServings: 2,
        steps: [],
        tags: [],
        cookingHistory: [],
        createdAt: 1,
        updatedAt: 1,
        version: 1,
    };
}

let localStorage: MemoryStorage;

beforeEach(async () => {
    await deleteDatabase();
    localStorage = new MemoryStorage();
    vi.stubGlobal("window", { indexedDB, localStorage });
});

describe("browser storage", () => {
    it("migreert een legacy-huishoudcache en verwijdert de bron pas na succesvolle opslag", async () => {
        localStorage.setItem(
            "cache:household:household-1",
            JSON.stringify({ recipes: [recipe()], mealPlan: [] })
        );

        const cache = await readHouseholdCache("household-1");

        expect(cache?.recipes[0]?.title).toBe("Testrecept");
        expect(localStorage.getItem("cache:household:household-1")).toBeNull();
        expect((await readHouseholdCache("household-1"))?.recipes).toHaveLength(1);
    });

    it("behoudt legacy-data wanneer IndexedDB niet beschikbaar is", async () => {
        localStorage.setItem("local.example", JSON.stringify({ value: true }));
        vi.stubGlobal("window", { localStorage });

        await expect(readLocalValue("local.example")).rejects.toThrow("IndexedDB");
        expect(localStorage.getItem("local.example")).not.toBeNull();
    });

    it("slaat een huishoudcache groter dan 10 MB op zonder localStorage te gebruiken", async () => {
        const largeImage = `data:image/png;base64,${"a".repeat(11 * 1024 * 1024)}`;

        await expect(persistHouseholdCache("household-1", [recipe(largeImage)], [])).resolves.toBe(true);
        expect((await readHouseholdCache("household-1"))?.recipes[0]?.image).toHaveLength(
            largeImage.length
        );
    });

    it("migreert boodschappenvoorkeuren zonder de overige browseropslag te raken", async () => {
        const key = "shopping:discarded:v2:household-1:2026-07-13";
        const preferences = { notToBringMealIds: ["meal-1"] };
        localStorage.setItem(key, JSON.stringify(preferences));

        await expect(readShoppingPreferences<typeof preferences>(key)).resolves.toEqual(preferences);
        expect(localStorage.getItem(key)).toBeNull();
        await expect(persistShoppingPreferences(key, preferences)).resolves.toBe(true);
    });
});
