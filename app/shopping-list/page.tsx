"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { addDays, endOfWeek, format, isWithinInterval, startOfWeek } from "date-fns";
import { nl } from "date-fns/locale";
import { BringShareItem, MealPlanEntry, MealType, ShoppingItem } from "@/types";
import { useStore } from "@/context/StoreContext";
import { toHumanQuantity } from "@/lib/utils/quantity";

const BRING_DEEPLINK_URL = "https://api.getbring.com/rest/bringrecipes/deeplink";
// Keep legacy storage key to preserve existing week preferences.
const BRING_PREFERENCE_STORAGE_PREFIX = "shopping:discarded:v2";

const MEAL_TYPE_ORDER: Record<MealType, number> = {
    lunch: 0,
    dinner: 1,
    other: 2,
};

const MEAL_TYPE_LABEL: Record<MealType, string> = {
    lunch: "Lunch",
    dinner: "Diner",
    other: "Anders",
};

interface MealIngredient {
    id: string;
    normalizedKey: string;
    name: string;
    unit: string;
    amount: number;
}

interface MealGroup {
    id: string;
    date: string;
    mealType: MealType;
    recipeId: string;
    title: string;
    servings: number;
    ingredients: MealIngredient[];
}

interface BringPreferenceStoragePayload {
    notToBringMealIds?: string[];
    notToBringIngredientIds?: string[];
    collapsedMealIds?: string[];
    discardedMealIds?: string[];
    discardedIngredientIds?: string[];
}

function getNormalizedIngredientKey(item: Pick<ShoppingItem, "name" | "unit">): string {
    return `${item.name.toLowerCase().trim()}::${item.unit.toLowerCase().trim()}`;
}

function getMealGroupId(entry: Pick<MealPlanEntry, "date" | "mealType" | "recipeId">): string {
    return `${entry.date}::${entry.mealType}::${entry.recipeId}`;
}

function getMealIngredientId(groupId: string, normalizedKey: string): string {
    return `${groupId}::${normalizedKey}`;
}

function buildBringPreferenceStorageKey(householdId: string, weekStartKey: string): string {
    return `${BRING_PREFERENCE_STORAGE_PREFIX}:${householdId}:${weekStartKey}`;
}

function resolveIngredientAmount(amount: number): number {
    if (Number.isFinite(amount) && amount > 0) {
        return amount;
    }
    return 1;
}

export default function ShoppingListPage() {
    const { mealPlan, recipes, mode, household, createBringShareSnapshot } = useStore();
    const [startDate, setStartDate] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
    const [notToBringMealIds, setNotToBringMealIds] = useState<Set<string>>(new Set());
    const [notToBringIngredientIds, setNotToBringIngredientIds] = useState<Set<string>>(new Set());
    const [bringPreferencesLoaded, setBringPreferencesLoaded] = useState(false);
    const [collapsedMealIds, setCollapsedMealIds] = useState<Set<string>>(new Set());
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const endDate = endOfWeek(startDate, { weekStartsOn: 1 });
    const householdKey = household?.id ?? "local";
    const weekStartKey = format(startDate, "yyyy-MM-dd");
    const bringPreferenceStorageKey = buildBringPreferenceStorageKey(householdKey, weekStartKey);

    const mealGroups = useMemo(() => {
        const recipesById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
        const groups: MealGroup[] = [];

        mealPlan.forEach((entry) => {
            const entryDate = new Date(entry.date);
            if (!isWithinInterval(entryDate, { start: startDate, end: endDate })) {
                return;
            }

            const recipe = recipesById.get(entry.recipeId);
            if (!recipe) {
                return;
            }

            const groupId = getMealGroupId(entry);
            const scaling = entry.servings / recipe.baseServings;
            const ingredientMap = new Map<string, MealIngredient>();

            recipe.ingredients.forEach((ingredient) => {
                const normalizedKey = getNormalizedIngredientKey(ingredient);
                const existing = ingredientMap.get(normalizedKey);
                const scaledAmount = resolveIngredientAmount(ingredient.amount) * scaling;

                if (existing) {
                    existing.amount += scaledAmount;
                    return;
                }

                ingredientMap.set(normalizedKey, {
                    id: getMealIngredientId(groupId, normalizedKey),
                    normalizedKey,
                    name: ingredient.name,
                    unit: ingredient.unit,
                    amount: scaledAmount,
                });
            });

            const ingredients = Array.from(ingredientMap.values()).sort((a, b) =>
                a.name.localeCompare(b.name, "nl-NL")
            );

            groups.push({
                id: groupId,
                date: entry.date,
                mealType: entry.mealType,
                recipeId: entry.recipeId,
                title: recipe.title,
                servings: entry.servings,
                ingredients,
            });
        });

        return groups.sort((a, b) => {
            if (a.date !== b.date) {
                return a.date.localeCompare(b.date);
            }

            const mealTypeDiff = MEAL_TYPE_ORDER[a.mealType] - MEAL_TYPE_ORDER[b.mealType];
            if (mealTypeDiff !== 0) {
                return mealTypeDiff;
            }

            return a.title.localeCompare(b.title, "nl-NL");
        });
    }, [endDate, mealPlan, recipes, startDate]);

    const mealStats = useMemo(() => {
        const stats = new Map<string, { toBring: number; notToBring: number; allNotToBring: boolean }>();

        mealGroups.forEach((group) => {
            let toBring = 0;
            let notToBring = 0;

            group.ingredients.forEach((ingredient) => {
                if (
                    notToBringMealIds.has(group.id) ||
                    notToBringIngredientIds.has(ingredient.id)
                ) {
                    notToBring += 1;
                } else {
                    toBring += 1;
                }
            });

            stats.set(group.id, {
                toBring,
                notToBring,
                allNotToBring: group.ingredients.length > 0 && toBring === 0,
            });
        });

        return stats;
    }, [mealGroups, notToBringIngredientIds, notToBringMealIds]);

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        setBringPreferencesLoaded(false);

        try {
            const raw = window.localStorage.getItem(bringPreferenceStorageKey);
            if (!raw) {
                setNotToBringMealIds(new Set());
                setNotToBringIngredientIds(new Set());
                setCollapsedMealIds(new Set());
                setBringPreferencesLoaded(true);
                return;
            }

            const parsed = JSON.parse(raw) as Partial<BringPreferenceStoragePayload>;
            const mealIds = Array.isArray(parsed.notToBringMealIds)
                ? parsed.notToBringMealIds.filter((value): value is string => typeof value === "string")
                : Array.isArray(parsed.discardedMealIds)
                    ? parsed.discardedMealIds.filter((value): value is string => typeof value === "string")
                : [];
            const ingredientIds = Array.isArray(parsed.notToBringIngredientIds)
                ? parsed.notToBringIngredientIds.filter((value): value is string => typeof value === "string")
                : Array.isArray(parsed.discardedIngredientIds)
                    ? parsed.discardedIngredientIds.filter((value): value is string => typeof value === "string")
                : [];
            const collapsedIds = Array.isArray(parsed.collapsedMealIds)
                ? parsed.collapsedMealIds.filter((value): value is string => typeof value === "string")
                : [];

            setNotToBringMealIds(new Set(mealIds));
            setNotToBringIngredientIds(new Set(ingredientIds));
            setCollapsedMealIds(new Set(collapsedIds));
        } catch {
            setNotToBringMealIds(new Set());
            setNotToBringIngredientIds(new Set());
            setCollapsedMealIds(new Set());
        } finally {
            setBringPreferencesLoaded(true);
        }
    }, [bringPreferenceStorageKey]);

    useEffect(() => {
        if (!bringPreferencesLoaded || typeof window === "undefined") {
            return;
        }

        const mealIds = Array.from(notToBringMealIds);
        const ingredientIds = Array.from(notToBringIngredientIds);
        const collapsedIds = Array.from(collapsedMealIds);
        const payload: BringPreferenceStoragePayload = {
            notToBringMealIds: mealIds,
            notToBringIngredientIds: ingredientIds,
            collapsedMealIds: collapsedIds,
            discardedMealIds: mealIds,
            discardedIngredientIds: ingredientIds,
        };
        window.localStorage.setItem(bringPreferenceStorageKey, JSON.stringify(payload));
    }, [
        bringPreferenceStorageKey,
        bringPreferencesLoaded,
        collapsedMealIds,
        notToBringIngredientIds,
        notToBringMealIds,
    ]);

    const totalIngredientRows = useMemo(
        () => mealGroups.reduce((total, group) => total + group.ingredients.length, 0),
        [mealGroups]
    );

    const toBringIngredientRows = useMemo(() => {
        let toBring = 0;

        mealGroups.forEach((group) => {
            group.ingredients.forEach((ingredient) => {
                if (
                    !notToBringMealIds.has(group.id) &&
                    !notToBringIngredientIds.has(ingredient.id)
                ) {
                    toBring += 1;
                }
            });
        });

        return toBring;
    }, [mealGroups, notToBringIngredientIds, notToBringMealIds]);

    const notToBringIngredientRows = totalIngredientRows - toBringIngredientRows;

    const fullyNotToBringMealCount = useMemo(() => {
        let count = 0;

        mealGroups.forEach((group) => {
            const stat = mealStats.get(group.id);
            if (stat?.allNotToBring) {
                count += 1;
            }
        });

        return count;
    }, [mealGroups, mealStats]);

    const bringItems = useMemo(() => {
        const aggregated = new Map<string, BringShareItem>();

        mealGroups.forEach((group) => {
            group.ingredients.forEach((ingredient) => {
                if (
                    notToBringMealIds.has(group.id) ||
                    notToBringIngredientIds.has(ingredient.id)
                ) {
                    return;
                }

                const existing = aggregated.get(ingredient.normalizedKey);
                if (existing) {
                    existing.amount += ingredient.amount;
                    return;
                }

                aggregated.set(ingredient.normalizedKey, {
                    name: ingredient.name,
                    unit: ingredient.unit,
                    amount: ingredient.amount,
                });
            });
        });

        return Array.from(aggregated.values()).sort((a, b) =>
            a.name.localeCompare(b.name, "nl-NL")
        );
    }, [mealGroups, notToBringIngredientIds, notToBringMealIds]);

    const toggleMealBringInclusion = (group: MealGroup) => {
        const nextMealIds = new Set(notToBringMealIds);
        const nextIngredientIds = new Set(notToBringIngredientIds);
        const stat = mealStats.get(group.id);
        const shouldBringAll = Boolean(stat?.allNotToBring);

        if (shouldBringAll) {
            nextMealIds.delete(group.id);
            group.ingredients.forEach((ingredient) => {
                nextIngredientIds.delete(ingredient.id);
            });
        } else {
            nextMealIds.add(group.id);
            group.ingredients.forEach((ingredient) => {
                nextIngredientIds.add(ingredient.id);
            });
        }

        setNotToBringMealIds(nextMealIds);
        setNotToBringIngredientIds(nextIngredientIds);
        setError(null);
    };

    const toggleIngredientBringInclusion = (group: MealGroup, ingredient: MealIngredient) => {
        const nextIngredientIds = new Set(notToBringIngredientIds);
        if (nextIngredientIds.has(ingredient.id)) {
            nextIngredientIds.delete(ingredient.id);
        } else {
            nextIngredientIds.add(ingredient.id);
        }

        const allIngredientsNotToBring = group.ingredients.every((item) =>
            nextIngredientIds.has(item.id)
        );

        const nextMealIds = new Set(notToBringMealIds);
        if (allIngredientsNotToBring) {
            nextMealIds.add(group.id);
        } else {
            nextMealIds.delete(group.id);
        }

        setNotToBringMealIds(nextMealIds);
        setNotToBringIngredientIds(nextIngredientIds);
        setError(null);
    };

    const toggleMealCollapsed = (groupId: string) => {
        const nextCollapsedMealIds = new Set(collapsedMealIds);
        if (nextCollapsedMealIds.has(groupId)) {
            nextCollapsedMealIds.delete(groupId);
        } else {
            nextCollapsedMealIds.add(groupId);
        }

        setCollapsedMealIds(nextCollapsedMealIds);
    };

    const resetBringPreferencesForWeek = () => {
        setNotToBringMealIds(new Set());
        setNotToBringIngredientIds(new Set());
        setCollapsedMealIds(new Set());
        setError(null);

        if (typeof window !== "undefined") {
            window.localStorage.removeItem(bringPreferenceStorageKey);
        }
    };

    const markWeekAsNotToBring = (sourceGroups: MealGroup[]) => {
        const nextMealIds = new Set(notToBringMealIds);
        const nextIngredientIds = new Set(notToBringIngredientIds);
        const nextCollapsedMealIds = new Set(collapsedMealIds);

        sourceGroups.forEach((group) => {
            nextMealIds.add(group.id);
            nextCollapsedMealIds.add(group.id);
            group.ingredients.forEach((ingredient) => {
                nextIngredientIds.add(ingredient.id);
            });
        });

        setNotToBringMealIds(nextMealIds);
        setNotToBringIngredientIds(nextIngredientIds);
        setCollapsedMealIds(nextCollapsedMealIds);

        if (typeof window !== "undefined") {
            const mealIds = Array.from(nextMealIds);
            const ingredientIds = Array.from(nextIngredientIds);
            const collapsedIds = Array.from(nextCollapsedMealIds);
            const payload: BringPreferenceStoragePayload = {
                notToBringMealIds: mealIds,
                notToBringIngredientIds: ingredientIds,
                collapsedMealIds: collapsedIds,
                discardedMealIds: mealIds,
                discardedIngredientIds: ingredientIds,
            };
            window.localStorage.setItem(bringPreferenceStorageKey, JSON.stringify(payload));
        }
    };

    const nextWeek = () => setStartDate(addDays(startDate, 7));
    const prevWeek = () => setStartDate(addDays(startDate, -7));

    const handleSendToBring = async () => {
        if (mode !== "firebase") {
            return;
        }

        setBusy(true);
        setError(null);

        try {
            if (bringItems.length === 0) {
                throw new Error("Er zijn geen ingredienten ingesteld op 'Naar Bring'.");
            }

            const snapshot = await createBringShareSnapshot({
                title: `Boodschappen ${startDate.toLocaleDateString("nl-NL")}`,
                items: bringItems.map((item) => ({
                    name: item.name,
                    amount: toHumanQuantity(item.amount, item.unit).roundedAmount,
                    unit: item.unit,
                })),
                servings: 1,
                sourceWeekStart: startDate.toISOString(),
            });

            markWeekAsNotToBring(mealGroups);

            const deeplinkUrl = `${BRING_DEEPLINK_URL}?url=${encodeURIComponent(
                snapshot.url
            )}&source=web&baseQuantity=1&requestedQuantity=1`;
            window.location.assign(deeplinkUrl);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Versturen naar Bring mislukt.");
        } finally {
            setBusy(false);
        }
    };

    const renderMealDate = (value: string) => {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return value;
        }

        return format(date, "EEE d MMM", { locale: nl });
    };

    return (
        <div className="min-h-screen bg-gray-50 pb-24">
            <div className="sticky top-0 z-10 flex items-center justify-between bg-white px-4 py-3 shadow">
                <button
                    type="button"
                    onClick={prevWeek}
                    aria-label="Vorige week"
                    className="p-2 text-gray-600"
                >
                    <Image src="/left-chevron-icon.svg" alt="" aria-hidden="true" width={16} height={16} className="h-4 w-4" />
                </button>
                <h1 className="text-lg font-bold">Boodschappen</h1>
                <button
                    type="button"
                    onClick={nextWeek}
                    aria-label="Volgende week"
                    className="p-2 text-gray-600"
                >
                    <Image src="/right-chevron-icon.svg" alt="" aria-hidden="true" width={16} height={16} className="h-4 w-4" />
                </button>
            </div>

            <div className="p-4">
                {mealGroups.length === 0 ? (
                    <div className="py-10 text-center text-gray-500">
                        Geen boodschappen voor deze week.
                        <Link href="/planner" className="mt-4 block font-bold text-green-600">
                            Plan maaltijden
                        </Link>
                    </div>
                ) : (
                    <>
                        <div className="mb-6 space-y-4">
                            {mealGroups.map((group) => {
                                const stat = mealStats.get(group.id) ?? {
                                    toBring: group.ingredients.length,
                                    notToBring: 0,
                                    allNotToBring: false,
                                };
                                const mealFullyNotToBring = stat.allNotToBring;
                                const mealCollapsed = collapsedMealIds.has(group.id);

                                return (
                                    <div
                                        key={group.id}
                                        className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm"
                                    >
                                        <div className="border-b border-gray-100 bg-gray-50 px-4 py-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                                                        {renderMealDate(group.date)} | {MEAL_TYPE_LABEL[group.mealType]}
                                                    </p>
                                                    <h3 className="text-sm font-semibold text-gray-900">{group.title}</h3>
                                                    <p className="mt-1 text-xs text-gray-500">
                                                        {group.servings} pers. | {stat.toBring} naar Bring / {stat.notToBring} niet naar Bring
                                                    </p>
                                                </div>
                                                <div className="flex flex-shrink-0 flex-col items-end gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleMealCollapsed(group.id)}
                                                        className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                                                    >
                                                        {mealCollapsed ? "Toon ingredienten" : "Verberg ingredienten"}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleMealBringInclusion(group)}
                                                        className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                                                    >
                                                        {mealFullyNotToBring ? "Alles naar Bring" : "Niets naar Bring"}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        {mealCollapsed ? (
                                            <div className="px-4 py-3 text-xs text-gray-500">
                                                Ingredienten zijn verborgen.
                                            </div>
                                        ) : (
                                            <div className="divide-y divide-gray-100">
                                                {group.ingredients.map((ingredient) => {
                                                    const ingredientNotToBring =
                                                        notToBringMealIds.has(group.id) ||
                                                        notToBringIngredientIds.has(ingredient.id);
                                                    const ingredientToBring = !ingredientNotToBring;

                                                    return (
                                                        <div
                                                            key={ingredient.id}
                                                            className={`flex items-center justify-between gap-3 px-4 py-3 ${ingredientNotToBring ? "bg-gray-50 opacity-70" : "hover:bg-gray-50"
                                                                }`}
                                                        >
                                                            <div
                                                                className={`min-w-0 ${ingredientNotToBring ? "text-gray-600 line-through" : "text-gray-800"
                                                                    }`}
                                                            >
                                                                <span className="mr-1 font-semibold">
                                                                    {ingredient.amount > 0
                                                                        ? toHumanQuantity(ingredient.amount, ingredient.unit)
                                                                            .displayWithUnit
                                                                        : ingredient.unit}
                                                                </span>
                                                                <span>{ingredient.name}</span>
                                                            </div>
                                                            <div className="ml-2 flex flex-shrink-0 items-center gap-2">
                                                                <button
                                                                    type="button"
                                                                    role="switch"
                                                                    aria-checked={ingredientToBring}
                                                                    aria-label={`${ingredient.name}: ${ingredientToBring ? "Naar Bring" : "Niet naar Bring"}`}
                                                                    onClick={() => toggleIngredientBringInclusion(group, ingredient)}
                                                                    className={`relative inline-flex h-6 w-11 items-center rounded-full p-1 transition-colors ${ingredientToBring ? "bg-green-600" : "bg-gray-300"
                                                                        }`}
                                                                >
                                                                    <span
                                                                        className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${ingredientToBring ? "translate-x-5" : "translate-x-0"
                                                                            }`}
                                                                    />
                                                                </button>
                                                                <span
                                                                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${ingredientToBring
                                                                        ? "bg-green-100 text-green-800"
                                                                        : "bg-gray-200 text-gray-700"
                                                                        }`}
                                                                >
                                                                    {ingredientToBring ? "Naar Bring" : "Niet naar Bring"}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        <p className="mb-1 text-xs text-gray-600">
                            {toBringIngredientRows} ingredienten gaan naar Bring
                        </p>
                        <p className="mb-1 text-xs text-gray-600">
                            {notToBringIngredientRows} ingredienten niet naar Bring
                        </p>
                        <p className="mb-3 text-xs text-gray-600">
                            {fullyNotToBringMealCount} maaltijden volledig niet naar Bring
                        </p>

                        {error ? (
                            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                                {error}
                            </div>
                        ) : null}

                        {mode !== "firebase" ? (
                            <div className="mb-3 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
                                Firebase modus staat uit; versturen naar Bring werkt alleen op de gehoste omgeving.
                            </div>
                        ) : null}

                        <button
                            type="button"
                            onClick={() => void handleSendToBring()}
                            disabled={busy || mode !== "firebase" || !bringPreferencesLoaded}
                            className="block w-full rounded-lg bg-green-600 py-3 text-center font-bold text-white shadow hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {busy ? "Bezig met versturen..." : "Stuur naar Bring"}
                        </button>

                        <button
                            type="button"
                            onClick={resetBringPreferencesForWeek}
                            className="mt-3 block w-full rounded-lg border border-gray-300 bg-white py-2 text-center text-sm font-medium text-gray-700 hover:bg-gray-50"
                        >
                            Herstel Bring-keuzes voor deze week
                        </button>

                        <Link
                            href={`/shopping-list/export?start=${startDate.toISOString()}`}
                            className="mt-3 block text-center text-sm font-medium text-gray-600 underline"
                        >
                            Open back-up exportpagina
                        </Link>
                    </>
                )}
            </div>
        </div>
    );
}
