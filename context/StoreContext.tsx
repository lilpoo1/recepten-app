"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import {
    AppUser,
    BringShareSnapshotInput,
    BringShareSnapshotResult,
    Household,
    InviteCode,
    MealPlanDraft,
    MealPlanEntry,
    Membership,
    MigrationStatus,
    Recipe,
    RecipeDraft,
    StorageMode,
} from "@/types";
import { auth, isFirebaseConfigured } from "@/lib/firebase/client";
import { DataSource, HouseholdDataSource } from "@/lib/data/types";
import { LocalDataSource } from "@/lib/data/local-data-source";
import {
    FirebaseDataSource,
    FirebaseHouseholdDataSource,
} from "@/lib/data/firebase-data-source";
import { LocalHouseholdDataSource } from "@/lib/data/local-household-data-source";
import { normalizeMealPlanEntry, normalizeRecipe } from "@/lib/data/normalize";

const CACHE_KEY_PREFIX = "cache:household:";
const LEGACY_RECIPES_KEY = "recipes";
const LEGACY_MEAL_PLAN_KEY = "mealPlan";
const MIGRATION_DISMISSED_PREFIX = "migration:dismissed:";

interface StoreContextType {
    mode: StorageMode;
    isReady: boolean;
    user: AppUser | null;
    household: Household | null;
    membership: Membership | null;
    inviteCode: InviteCode | null;
    recipes: Recipe[];
    mealPlan: MealPlanEntry[];
    migration: MigrationStatus | null;
    addRecipe: (recipe: RecipeDraft) => Promise<void>;
    updateRecipe: (recipe: Recipe) => Promise<void>;
    deleteRecipe: (id: string) => Promise<void>;
    markAsCooked: (id: string) => Promise<void>;
    addToMealPlan: (entry: MealPlanDraft) => Promise<void>;
    removeFromMealPlan: (date: string, recipeId: string, mealType: MealPlanEntry["mealType"]) => Promise<void>;
    getRecipeById: (id: string) => Recipe | undefined;
    createHousehold: (name: string) => Promise<void>;
    joinHousehold: (code: string) => Promise<void>;
    refreshInviteCode: () => Promise<void>;
    revokeInviteCode: () => Promise<void>;
    importLocalToHousehold: () => Promise<void>;
    dismissMigration: () => void;
    createBringShareSnapshot: (
        input: BringShareSnapshotInput
    ) => Promise<BringShareSnapshotResult>;
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

function readJsonArray(key: string): unknown[] {
    if (typeof window === "undefined") {
        return [];
    }

    const raw = window.localStorage.getItem(key);
    if (!raw) {
        return [];
    }

    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function writeHouseholdCache(householdId: string, recipes: Recipe[], mealPlan: MealPlanEntry[]) {
    if (typeof window === "undefined") {
        return;
    }
    window.localStorage.setItem(
        `${CACHE_KEY_PREFIX}${householdId}`,
        JSON.stringify({ recipes, mealPlan })
    );
}

function readHouseholdCache(householdId: string): { recipes: Recipe[]; mealPlan: MealPlanEntry[] } | null {
    if (typeof window === "undefined") {
        return null;
    }

    const raw = window.localStorage.getItem(`${CACHE_KEY_PREFIX}${householdId}`);
    if (!raw) {
        return null;
    }

    try {
        const parsed = JSON.parse(raw) as { recipes?: Recipe[]; mealPlan?: MealPlanEntry[] };
        return {
            recipes: Array.isArray(parsed.recipes) ? parsed.recipes : [],
            mealPlan: Array.isArray(parsed.mealPlan) ? parsed.mealPlan : [],
        };
    } catch {
        return null;
    }
}

function normalizeLegacyData(
    householdId: string,
    userId: string
): { recipes: Recipe[]; mealPlan: MealPlanEntry[] } {
    const recipes = readJsonArray(LEGACY_RECIPES_KEY).map((item) =>
        normalizeRecipe(item, householdId, userId)
    );
    const mealPlan = readJsonArray(LEGACY_MEAL_PLAN_KEY).map((item) =>
        normalizeMealPlanEntry(item, householdId, userId)
    );
    return { recipes, mealPlan };
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
    const mode: StorageMode = isFirebaseConfigured ? "firebase" : "local";

    const dataSource: DataSource = useMemo(
        () => (mode === "firebase" ? new FirebaseDataSource() : new LocalDataSource()),
        [mode]
    );
    const householdSource: HouseholdDataSource = useMemo(
        () =>
            mode === "firebase"
                ? new FirebaseHouseholdDataSource()
                : new LocalHouseholdDataSource(),
        [mode]
    );

    const [isReady, setIsReady] = useState(mode !== "firebase");
    const [user, setUser] = useState<AppUser | null>(
        mode === "local" ? { uid: "local-user", isAnonymous: true } : null
    );
    const [household, setHousehold] = useState<Household | null>(null);
    const [membership, setMembership] = useState<Membership | null>(null);
    const [inviteCode, setInviteCode] = useState<InviteCode | null>(null);
    const [recipes, setRecipes] = useState<Recipe[]>([]);
    const [mealPlan, setMealPlan] = useState<MealPlanEntry[]>([]);
    const [migration, setMigration] = useState<MigrationStatus | null>(null);

    useEffect(() => {
        if (mode !== "firebase" || !auth) {
            return;
        }
        const authClient = auth;

        const unsubscribe = onAuthStateChanged(authClient, async (firebaseUser) => {
            if (!firebaseUser) {
                await signInAnonymously(authClient);
                return;
            }

            setUser({
                uid: firebaseUser.uid,
                isAnonymous: firebaseUser.isAnonymous,
            });
            setIsReady(true);
        });

        return () => unsubscribe();
    }, [mode]);

    useEffect(() => {
        if (!user) {
            return;
        }

        let active = true;
        const run = async () => {
            const currentMembership = await householdSource.getMembership(user.uid);
            if (!active) {
                return;
            }

            if (!currentMembership) {
                if (mode === "local") {
                    const newHousehold = await householdSource.createHousehold(
                        user.uid,
                        "Lokaal huishouden"
                    );
                    const localMembership = await householdSource.getMembership(user.uid);
                    if (!active) {
                        return;
                    }
                    setHousehold(newHousehold);
                    setMembership(localMembership);
                    if (newHousehold.activeInviteCode) {
                        const invite = await householdSource.getInviteCode(newHousehold.activeInviteCode);
                        if (active) {
                            setInviteCode(invite);
                        }
                    }
                    return;
                }

                setMembership(null);
                setHousehold(null);
                setInviteCode(null);
                return;
            }

            const currentHousehold = await householdSource.getHousehold(currentMembership.householdId);
            if (!active) {
                return;
            }

            setMembership(currentMembership);
            setHousehold(currentHousehold);
            if (currentHousehold?.activeInviteCode) {
                const invite = await householdSource.getInviteCode(currentHousehold.activeInviteCode);
                if (active) {
                    setInviteCode(invite);
                }
            } else {
                setInviteCode(null);
            }
        };

        void run();

        return () => {
            active = false;
        };
    }, [householdSource, mode, user]);

    useEffect(() => {
        if (!household) {
            return;
        }

        let active = true;
        const hydrateFromCache = async () => {
            const cached = readHouseholdCache(household.id);
            if (!active || !cached) {
                return;
            }
            setRecipes(cached.recipes);
            setMealPlan(cached.mealPlan);
        };
        void hydrateFromCache();

        const applySnapshot = (snapshot: { recipes: Recipe[]; mealPlan: MealPlanEntry[] }) => {
            if (!active) {
                return;
            }
            setRecipes(snapshot.recipes);
            setMealPlan(snapshot.mealPlan);
            writeHouseholdCache(household.id, snapshot.recipes, snapshot.mealPlan);
        };

        void dataSource.loadHouseholdData(household.id).then(applySnapshot);
        const unsubscribe = dataSource.watchHouseholdData(household.id, applySnapshot);

        return () => {
            active = false;
            unsubscribe();
        };
    }, [dataSource, household]);

    useEffect(() => {
        let active = true;

        const run = async () => {
            if (!household || !user || mode !== "firebase") {
                if (active) {
                    setMigration(null);
                }
                return;
            }

            const remoteState = await householdSource.getMigrationState(household.id);
            if (!active) {
                return;
            }

            const local = normalizeLegacyData(household.id, user.uid);
            const dismissedAtRaw =
                typeof window !== "undefined"
                    ? window.localStorage.getItem(`${MIGRATION_DISMISSED_PREFIX}${household.id}`)
                    : null;
            const dismissedAt = dismissedAtRaw ? Number(dismissedAtRaw) : undefined;

            if (remoteState.done || (local.recipes.length === 0 && local.mealPlan.length === 0)) {
                setMigration({
                    householdId: household.id,
                    sourceRecipeCount: local.recipes.length,
                    sourceMealPlanCount: local.mealPlan.length,
                    done: true,
                    importedAt: remoteState.importedAt,
                    dismissedAt,
                });
                return;
            }

            setMigration({
                householdId: household.id,
                sourceRecipeCount: local.recipes.length,
                sourceMealPlanCount: local.mealPlan.length,
                done: false,
                dismissedAt,
            });
        };

        void run();

        return () => {
            active = false;
        };
    }, [household, householdSource, mode, user]);

    const requireSession = () => {
        if (!user) {
            throw new Error("Geen gebruiker geladen.");
        }
        if (!household) {
            throw new Error("Geen huishouden geselecteerd.");
        }
        return { userId: user.uid, householdId: household.id };
    };

    const addRecipe = async (recipe: RecipeDraft) => {
        const session = requireSession();
        await dataSource.addRecipe(session.householdId, session.userId, recipe);
    };

    const updateRecipe = async (recipe: Recipe) => {
        const session = requireSession();
        await dataSource.updateRecipe(session.householdId, session.userId, recipe);
    };

    const deleteRecipe = async (id: string) => {
        const session = requireSession();
        await dataSource.deleteRecipe(session.householdId, id);
    };

    const markAsCooked = async (id: string) => {
        const session = requireSession();
        await dataSource.markAsCooked(session.householdId, id);
    };

    const addToMealPlan = async (entry: MealPlanDraft) => {
        const session = requireSession();
        await dataSource.upsertMealPlanEntry(session.householdId, session.userId, entry);
    };

    const removeFromMealPlan = async (
        date: string,
        recipeId: string,
        mealType: MealPlanEntry["mealType"]
    ) => {
        const session = requireSession();
        await dataSource.removeMealPlanEntry(session.householdId, date, recipeId, mealType);
    };

    const getRecipeById = (id: string) => recipes.find((recipe) => recipe.id === id);

    const createHousehold = async (name: string) => {
        if (!user) {
            throw new Error("Gebruiker niet beschikbaar.");
        }
        const created = await householdSource.createHousehold(user.uid, name.trim() || "Mijn huishouden");
        const nextMembership = await householdSource.getMembership(user.uid);
        setHousehold(created);
        setMembership(nextMembership);
        if (created.activeInviteCode) {
            const invite = await householdSource.getInviteCode(created.activeInviteCode);
            setInviteCode(invite);
        }
    };

    const joinHousehold = async (code: string) => {
        if (!user) {
            throw new Error("Gebruiker niet beschikbaar.");
        }
        const nextMembership = await householdSource.joinHousehold(user.uid, code);
        const nextHousehold = await householdSource.getHousehold(nextMembership.householdId);
        setMembership(nextMembership);
        setHousehold(nextHousehold);
        if (nextHousehold?.activeInviteCode) {
            const invite = await householdSource.getInviteCode(nextHousehold.activeInviteCode);
            setInviteCode(invite);
        } else {
            setInviteCode(null);
        }
    };

    const refreshInviteCode = async () => {
        if (!household || !user) {
            throw new Error("Geen huishouden beschikbaar.");
        }
        const invite = await householdSource.refreshInviteCode(household, user.uid);
        const nextHousehold = await householdSource.getHousehold(household.id);
        setInviteCode(invite);
        setHousehold(nextHousehold);
    };

    const revokeInviteCode = async () => {
        if (!household) {
            throw new Error("Geen huishouden beschikbaar.");
        }
        await householdSource.revokeInviteCode(household);
        const nextHousehold = await householdSource.getHousehold(household.id);
        setInviteCode(null);
        setHousehold(nextHousehold);
    };

    const importLocalToHousehold = async () => {
        if (!migration || migration.done) {
            return;
        }
        const session = requireSession();
        const legacy = normalizeLegacyData(session.householdId, session.userId);

        const titleToId = new Map<string, string>();
        recipes.forEach((recipe) => {
            titleToId.set(recipe.title.trim().toLowerCase(), recipe.id);
        });

        const idMap = new Map<string, string>();
        for (const legacyRecipe of legacy.recipes) {
            const key = legacyRecipe.title.trim().toLowerCase();
            const existingId = titleToId.get(key);
            if (existingId) {
                idMap.set(legacyRecipe.id, existingId);
                continue;
            }

            const createdId = await dataSource.addRecipe(session.householdId, session.userId, {
                title: legacyRecipe.title,
                description: legacyRecipe.description,
                image: legacyRecipe.image,
                ingredients: legacyRecipe.ingredients,
                baseServings: legacyRecipe.baseServings,
                steps: legacyRecipe.steps,
                prepTimeMinutes: legacyRecipe.prepTimeMinutes,
                difficulty: legacyRecipe.difficulty,
                tags: legacyRecipe.tags,
                notes: legacyRecipe.notes,
            });
            idMap.set(legacyRecipe.id, createdId);
            titleToId.set(key, createdId);
        }

        for (const entry of legacy.mealPlan) {
            const mappedRecipeId = idMap.get(entry.recipeId);
            if (!mappedRecipeId) {
                continue;
            }
            await dataSource.upsertMealPlanEntry(session.householdId, session.userId, {
                date: entry.date,
                recipeId: mappedRecipeId,
                servings: entry.servings,
                mealType: entry.mealType,
            });
        }

        await householdSource.setMigrationDone(session.householdId);
        setMigration((prev) =>
            prev
                ? {
                    ...prev,
                    done: true,
                    importedAt: Date.now(),
                }
                : null
        );
    };

    const dismissMigration = () => {
        if (!household) {
            return;
        }
        const dismissedAt = Date.now();
        if (typeof window !== "undefined") {
            window.localStorage.setItem(
                `${MIGRATION_DISMISSED_PREFIX}${household.id}`,
                dismissedAt.toString()
            );
        }
        setMigration((prev) => (prev ? { ...prev, dismissedAt } : prev));
    };

    const createBringShareSnapshot = async (
        input: BringShareSnapshotInput
    ): Promise<BringShareSnapshotResult> => {
        const session = requireSession();
        const baseUrl =
            typeof window !== "undefined" ? window.location.origin : "";
        return dataSource.createBringShareSnapshot(
            session.householdId,
            session.userId,
            input,
            baseUrl
        );
    };

    return (
        <StoreContext.Provider
            value={{
                mode,
                isReady,
                user,
                household,
                membership,
                inviteCode,
                recipes,
                mealPlan,
                migration,
                addRecipe,
                updateRecipe,
                deleteRecipe,
                markAsCooked,
                addToMealPlan,
                removeFromMealPlan,
                getRecipeById,
                createHousehold,
                joinHousehold,
                refreshInviteCode,
                revokeInviteCode,
                importLocalToHousehold,
                dismissMigration,
                createBringShareSnapshot,
            }}
        >
            {children}
        </StoreContext.Provider>
    );
}

export const DataProvider = StoreProvider;

export function useStore() {
    const context = useContext(StoreContext);
    if (context === undefined) {
        throw new Error("useStore must be used within a StoreProvider");
    }
    return context;
}

export const useData = useStore;
