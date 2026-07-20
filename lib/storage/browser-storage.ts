import { MealPlanEntry, Recipe } from "@/types";
import { normalizeMealPlanEntry, normalizeRecipe } from "@/lib/data/normalize";

const DATABASE_NAME = "recepten-app";
const DATABASE_VERSION = 1;
const STORE_NAME = "records";
const LOCAL_VALUE_PREFIX = "local-value:";
const HOUSEHOLD_CACHE_PREFIX = "household-cache:";
const HOUSEHOLD_CACHE_HISTORY_PREFIX = "household-cache-history:";
const SHOPPING_PREFERENCES_PREFIX = "shopping-preferences:";

interface StoredRecord<T> {
    key: string;
    value: T;
}

export interface HouseholdCache {
    recipes: Recipe[];
    mealPlan: MealPlanEntry[];
}

export interface HouseholdCacheSnapshot {
    capturedAt: number;
    cache: HouseholdCache;
}

function isBrowser() {
    return typeof window !== "undefined";
}

function openDatabase(): Promise<IDBDatabase> {
    if (!isBrowser() || !window.indexedDB) {
        return Promise.reject(new Error("IndexedDB is niet beschikbaar in deze browser."));
    }

    return new Promise((resolve, reject) => {
        const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                database.createObjectStore(STORE_NAME, { keyPath: "key" });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB openen mislukt."));
    });
}

async function withStore<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
    const database = await openDatabase();

    try {
        return await new Promise<T>((resolve, reject) => {
            const transaction = database.transaction(STORE_NAME, mode);
            const request = run(transaction.objectStore(STORE_NAME));
            let result: T;

            request.onsuccess = () => {
                result = request.result;
            };
            request.onerror = () => reject(request.error ?? new Error("IndexedDB-bewerking mislukt."));
            transaction.oncomplete = () => resolve(result);
            transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB-transactie mislukt."));
            transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB-transactie afgebroken."));
        });
    } finally {
        database.close();
    }
}

async function readRecord<T>(key: string): Promise<T | null> {
    const record = await withStore<StoredRecord<T> | undefined>("readonly", (store) => store.get(key));
    return record?.value ?? null;
}

async function writeRecord<T>(key: string, value: T): Promise<void> {
    await withStore<IDBValidKey>("readwrite", (store) => store.put({ key, value } satisfies StoredRecord<T>));
}

async function deleteRecord(key: string): Promise<void> {
    await withStore<undefined>("readwrite", (store) => store.delete(key));
}

function readLegacyJson(legacyKey: string): unknown | null {
    if (!isBrowser()) {
        return null;
    }

    const raw = window.localStorage.getItem(legacyKey);
    if (!raw) {
        return null;
    }

    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

async function readOrMigrate<T>(
    recordKey: string,
    legacyKey: string,
    normalize: (value: unknown) => T | null
): Promise<T | null> {
    const stored = await readRecord<T>(recordKey);
    if (stored !== null) {
        return stored;
    }

    const legacy = readLegacyJson(legacyKey);
    if (legacy === null) {
        return null;
    }

    const value = normalize(legacy);
    if (value === null) {
        return null;
    }

    await writeRecord(recordKey, value);
    window.localStorage.removeItem(legacyKey);
    return value;
}

function asRecord(value: unknown): Record<string, unknown> {
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function normalizeJsonValue<T>(value: unknown): T | null {
    return value === undefined ? null : (value as T);
}

export async function readLocalValue<T>(legacyKey: string): Promise<T | null> {
    return readOrMigrate(`${LOCAL_VALUE_PREFIX}${legacyKey}`, legacyKey, normalizeJsonValue<T>);
}

export async function writeLocalValue<T>(legacyKey: string, value: T): Promise<void> {
    await writeRecord(`${LOCAL_VALUE_PREFIX}${legacyKey}`, value);
}

export async function removeLocalValue(legacyKey: string): Promise<void> {
    await deleteRecord(`${LOCAL_VALUE_PREFIX}${legacyKey}`);
    if (isBrowser()) {
        window.localStorage.removeItem(legacyKey);
    }
}

export async function readLocalRecipes(householdId: string, userId: string): Promise<Recipe[]> {
    const recipes = await readOrMigrate(
        `${LOCAL_VALUE_PREFIX}recipes`,
        "recipes",
        (value) =>
            Array.isArray(value)
                ? value.map((recipe) => normalizeRecipe(recipe, householdId, userId))
                : []
    );

    return (recipes ?? []).map((recipe) => normalizeRecipe(recipe, householdId, userId));
}

export async function readLocalMealPlan(
    householdId: string,
    userId: string
): Promise<MealPlanEntry[]> {
    const mealPlan = await readOrMigrate(
        `${LOCAL_VALUE_PREFIX}mealPlan`,
        "mealPlan",
        (value) =>
            Array.isArray(value)
                ? value.map((entry) => normalizeMealPlanEntry(entry, householdId, userId))
                : []
    );

    return (mealPlan ?? []).map((entry) => normalizeMealPlanEntry(entry, householdId, userId));
}

export async function readHouseholdCache(householdId: string): Promise<HouseholdCache | null> {
    const cache = await readOrMigrate(
        `${HOUSEHOLD_CACHE_PREFIX}${householdId}`,
        `cache:household:${householdId}`,
        (value) => {
            const data = asRecord(value);
            const recipes = Array.isArray(data.recipes)
                ? data.recipes.map((recipe) => normalizeRecipe(recipe, householdId, "unknown-user"))
                : [];
            const mealPlan = Array.isArray(data.mealPlan)
                ? data.mealPlan.map((entry) => normalizeMealPlanEntry(entry, householdId, "unknown-user"))
                : [];

            return { recipes, mealPlan } satisfies HouseholdCache;
        }
    );

    if (!cache) {
        return null;
    }

    return {
        recipes: cache.recipes.map((recipe) => normalizeRecipe(recipe, householdId, "unknown-user")),
        mealPlan: cache.mealPlan.map((entry) => normalizeMealPlanEntry(entry, householdId, "unknown-user")),
    };
}

export async function persistHouseholdCache(
    householdId: string,
    recipes: Recipe[],
    mealPlan: MealPlanEntry[]
): Promise<boolean> {
    try {
        const nextCache = { recipes, mealPlan } satisfies HouseholdCache;
        const historyKey = `${HOUSEHOLD_CACHE_HISTORY_PREFIX}${householdId}`;
        const history = (await readRecord<HouseholdCacheSnapshot[]>(historyKey)) ?? [];
        const signature = (cache: HouseholdCache) =>
            JSON.stringify({
                recipes: cache.recipes.map((recipe) => [
                    recipe.id,
                    recipe.version,
                    recipe.deletedAt ?? 0,
                ]),
                mealPlan: cache.mealPlan.map((entry) => [entry.id, entry.version]),
            });
        const nextSignature = signature(nextCache);
        const uniqueHistory = history.filter(
            (snapshot) => signature(snapshot.cache) !== nextSignature
        );
        await writeRecord(historyKey, [
            { capturedAt: Date.now(), cache: nextCache },
            ...uniqueHistory,
        ].slice(0, 3));
        await writeRecord(`${HOUSEHOLD_CACHE_PREFIX}${householdId}`, nextCache);
        return true;
    } catch (error) {
        console.warn("Huishoudcache kon niet offline worden opgeslagen.", error);
        return false;
    }
}

export async function readHouseholdCacheSnapshots(
    householdId: string
): Promise<HouseholdCacheSnapshot[]> {
    return (await readRecord<HouseholdCacheSnapshot[]>(
        `${HOUSEHOLD_CACHE_HISTORY_PREFIX}${householdId}`
    )) ?? [];
}

export async function readShoppingPreferences<T>(storageKey: string): Promise<T | null> {
    return readOrMigrate(
        `${SHOPPING_PREFERENCES_PREFIX}${storageKey}`,
        storageKey,
        normalizeJsonValue<T>
    );
}

export async function persistShoppingPreferences<T>(storageKey: string, value: T): Promise<boolean> {
    try {
        await writeRecord(`${SHOPPING_PREFERENCES_PREFIX}${storageKey}`, value);
        return true;
    } catch (error) {
        console.warn("Boodschappenvoorkeuren konden niet offline worden opgeslagen.", error);
        return false;
    }
}

export async function removeShoppingPreferences(storageKey: string): Promise<void> {
    await deleteRecord(`${SHOPPING_PREFERENCES_PREFIX}${storageKey}`);
    if (isBrowser()) {
        window.localStorage.removeItem(storageKey);
    }
}
