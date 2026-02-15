"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { addDays, endOfWeek, format, isWithinInterval, startOfWeek } from "date-fns";
import { nl } from "date-fns/locale";
import { BringShareItem, MealPlanEntry, MealType, ShoppingItem } from "@/types";
import { useStore } from "@/context/StoreContext";

const BRING_DEEPLINK_URL = "https://api.getbring.com/rest/bringrecipes/deeplink";
const DISCARD_STORAGE_PREFIX = "shopping:discarded:v2";

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

interface DiscardedStoragePayload {
    discardedMealIds: string[];
    discardedIngredientIds: string[];
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

function buildDiscardStorageKey(householdId: string, weekStartKey: string): string {
    return `${DISCARD_STORAGE_PREFIX}:${householdId}:${weekStartKey}`;
}

function resolveIngredientAmount(amount: number): number {
    if (Number.isFinite(amount) && amount > 0) {
        return amount;
    }
    return 1;
}

function roundToOneDecimal(value: number): number {
    return Number.parseFloat(value.toFixed(1));
}

function formatAmount(value: number): string {
    return roundToOneDecimal(value).toLocaleString("nl-NL", { maximumFractionDigits: 1 });
}

export default function ShoppingListPage() {
    const { mealPlan, recipes, mode, household, createBringShareSnapshot } = useStore();
    const [startDate, setStartDate] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
    const [discardedMealIds, setDiscardedMealIds] = useState<Set<string>>(new Set());
    const [discardedIngredientIds, setDiscardedIngredientIds] = useState<Set<string>>(new Set());
    const [discardedLoaded, setDiscardedLoaded] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const endDate = endOfWeek(startDate, { weekStartsOn: 1 });
    const householdKey = household?.id ?? "local";
    const weekStartKey = format(startDate, "yyyy-MM-dd");
    const discardStorageKey = buildDiscardStorageKey(householdKey, weekStartKey);

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
        const stats = new Map<string, { active: number; discarded: number; allDiscarded: boolean }>();

        mealGroups.forEach((group) => {
            let active = 0;
            let discarded = 0;

            group.ingredients.forEach((ingredient) => {
                if (
                    discardedMealIds.has(group.id) ||
                    discardedIngredientIds.has(ingredient.id)
                ) {
                    discarded += 1;
                } else {
                    active += 1;
                }
            });

            stats.set(group.id, {
                active,
                discarded,
                allDiscarded: group.ingredients.length > 0 && active === 0,
            });
        });

        return stats;
    }, [discardedIngredientIds, discardedMealIds, mealGroups]);

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        setDiscardedLoaded(false);

        try {
            const raw = window.localStorage.getItem(discardStorageKey);
            if (!raw) {
                setDiscardedMealIds(new Set());
                setDiscardedIngredientIds(new Set());
                setDiscardedLoaded(true);
                return;
            }

            const parsed = JSON.parse(raw) as Partial<DiscardedStoragePayload>;
            const mealIds = Array.isArray(parsed.discardedMealIds)
                ? parsed.discardedMealIds.filter((value): value is string => typeof value === "string")
                : [];
            const ingredientIds = Array.isArray(parsed.discardedIngredientIds)
                ? parsed.discardedIngredientIds.filter((value): value is string => typeof value === "string")
                : [];

            setDiscardedMealIds(new Set(mealIds));
            setDiscardedIngredientIds(new Set(ingredientIds));
        } catch {
            setDiscardedMealIds(new Set());
            setDiscardedIngredientIds(new Set());
        } finally {
            setDiscardedLoaded(true);
        }
    }, [discardStorageKey]);

    useEffect(() => {
        if (!discardedLoaded || typeof window === "undefined") {
            return;
        }

        const payload: DiscardedStoragePayload = {
            discardedMealIds: Array.from(discardedMealIds),
            discardedIngredientIds: Array.from(discardedIngredientIds),
        };
        window.localStorage.setItem(discardStorageKey, JSON.stringify(payload));
    }, [discardStorageKey, discardedIngredientIds, discardedLoaded, discardedMealIds]);

    const totalIngredientRows = useMemo(
        () => mealGroups.reduce((total, group) => total + group.ingredients.length, 0),
        [mealGroups]
    );

    const activeIngredientRows = useMemo(() => {
        let active = 0;

        mealGroups.forEach((group) => {
            group.ingredients.forEach((ingredient) => {
                if (
                    !discardedMealIds.has(group.id) &&
                    !discardedIngredientIds.has(ingredient.id)
                ) {
                    active += 1;
                }
            });
        });

        return active;
    }, [discardedIngredientIds, discardedMealIds, mealGroups]);

    const excludedIngredientRows = totalIngredientRows - activeIngredientRows;

    const fullyDiscardedMealCount = useMemo(() => {
        let count = 0;

        mealGroups.forEach((group) => {
            const stat = mealStats.get(group.id);
            if (stat?.allDiscarded) {
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
                    discardedMealIds.has(group.id) ||
                    discardedIngredientIds.has(ingredient.id)
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
    }, [discardedIngredientIds, discardedMealIds, mealGroups]);

    const toggleMealDiscard = (group: MealGroup) => {
        const nextMealIds = new Set(discardedMealIds);
        const nextIngredientIds = new Set(discardedIngredientIds);
        const stat = mealStats.get(group.id);
        const shouldUndiscard = Boolean(stat?.allDiscarded);

        if (shouldUndiscard) {
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

        setDiscardedMealIds(nextMealIds);
        setDiscardedIngredientIds(nextIngredientIds);
        setError(null);
    };

    const toggleIngredientDiscard = (group: MealGroup, ingredient: MealIngredient) => {
        const nextIngredientIds = new Set(discardedIngredientIds);
        if (nextIngredientIds.has(ingredient.id)) {
            nextIngredientIds.delete(ingredient.id);
        } else {
            nextIngredientIds.add(ingredient.id);
        }

        const allIngredientsDiscarded = group.ingredients.every((item) =>
            nextIngredientIds.has(item.id)
        );

        const nextMealIds = new Set(discardedMealIds);
        if (allIngredientsDiscarded) {
            nextMealIds.add(group.id);
        } else {
            nextMealIds.delete(group.id);
        }

        setDiscardedMealIds(nextMealIds);
        setDiscardedIngredientIds(nextIngredientIds);
        setError(null);
    };

    const resetDiscardedForWeek = () => {
        setDiscardedMealIds(new Set());
        setDiscardedIngredientIds(new Set());
        setError(null);

        if (typeof window !== "undefined") {
            window.localStorage.removeItem(discardStorageKey);
        }
    };

    const markWeekAsDiscarded = (sourceGroups: MealGroup[]) => {
        const nextMealIds = new Set(discardedMealIds);
        const nextIngredientIds = new Set(discardedIngredientIds);

        sourceGroups.forEach((group) => {
            nextMealIds.add(group.id);
            group.ingredients.forEach((ingredient) => {
                nextIngredientIds.add(ingredient.id);
            });
        });

        setDiscardedMealIds(nextMealIds);
        setDiscardedIngredientIds(nextIngredientIds);

        if (typeof window !== "undefined") {
            const payload: DiscardedStoragePayload = {
                discardedMealIds: Array.from(nextMealIds),
                discardedIngredientIds: Array.from(nextIngredientIds),
            };
            window.localStorage.setItem(discardStorageKey, JSON.stringify(payload));
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
                throw new Error("Er zijn geen geselecteerde boodschappen om naar Bring te sturen.");
            }

            const snapshot = await createBringShareSnapshot({
                title: `Boodschappen ${startDate.toLocaleDateString("nl-NL")}`,
                items: bringItems.map((item) => ({
                    name: item.name,
                    amount: roundToOneDecimal(item.amount),
                    unit: item.unit,
                })),
                servings: 1,
                sourceWeekStart: startDate.toISOString(),
            });

            markWeekAsDiscarded(mealGroups);

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
                <button onClick={prevWeek} className="p-2 text-gray-600">
                    {"<"}
                </button>
                <h1 className="text-lg font-bold">Boodschappen</h1>
                <button onClick={nextWeek} className="p-2 text-gray-600">
                    {">"}
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
                                    active: group.ingredients.length,
                                    discarded: 0,
                                    allDiscarded: false,
                                };
                                const mealFullyDiscarded = stat.allDiscarded;

                                return (
                                    <div
                                        key={group.id}
                                        className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm"
                                    >
                                        <div className="border-b border-gray-100 bg-gray-50 px-4 py-3">
                                            <div className="flex items-start justify-between gap-2">
                                                <div>
                                                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                                                        {renderMealDate(group.date)} | {MEAL_TYPE_LABEL[group.mealType]}
                                                    </p>
                                                    <h3 className="text-sm font-semibold text-gray-900">{group.title}</h3>
                                                    <p className="mt-1 text-xs text-gray-500">
                                                        {group.servings} pers. | {stat.active} actief / {stat.discarded} uitgesloten
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => toggleMealDiscard(group)}
                                                    className={`rounded-md px-3 py-1.5 text-xs font-semibold ${mealFullyDiscarded
                                                        ? "border border-gray-300 bg-white text-gray-700"
                                                        : "border border-gray-300 bg-gray-100 text-gray-700 hover:bg-gray-200"
                                                        }`}
                                                >
                                                    {mealFullyDiscarded ? "Alles meenemen" : "Alles uitsluiten"}
                                                </button>
                                            </div>
                                        </div>

                                        <div className="divide-y divide-gray-100">
                                            {group.ingredients.map((ingredient) => {
                                                const ingredientDiscarded =
                                                    discardedMealIds.has(group.id) ||
                                                    discardedIngredientIds.has(ingredient.id);
                                                return (
                                                    <button
                                                        type="button"
                                                        key={ingredient.id}
                                                        onClick={() => toggleIngredientDiscard(group, ingredient)}
                                                        disabled={mealFullyDiscarded}
                                                        className={`flex w-full items-center justify-between px-4 py-3 text-left ${mealFullyDiscarded ? "cursor-not-allowed bg-gray-50" : "hover:bg-gray-50"
                                                            }`}
                                                    >
                                                        <div className="flex min-w-0 items-center gap-3">
                                                            <span
                                                                className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border text-xs font-bold ${ingredientDiscarded
                                                                    ? "border-gray-400 bg-gray-300 text-gray-700"
                                                                    : "border-gray-300 bg-white text-transparent"
                                                                    }`}
                                                                aria-hidden="true"
                                                            >
                                                                {ingredientDiscarded ? "−" : "."}
                                                            </span>
                                                            <div className={ingredientDiscarded ? "text-gray-500 line-through" : "text-gray-800"}>
                                                                <span className="mr-1 font-semibold">
                                                                    {ingredient.amount > 0 ? formatAmount(ingredient.amount) : ""}{" "}
                                                                    {ingredient.unit}
                                                                </span>
                                                                <span>{ingredient.name}</span>
                                                            </div>
                                                        </div>
                                                        {ingredientDiscarded ? (
                                                            <span className="ml-3 rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-700">
                                                                Uitgesloten
                                                            </span>
                                                        ) : null}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <p className="mb-1 text-xs text-gray-600">
                            {activeIngredientRows} ingredienten worden verstuurd
                        </p>
                        <p className="mb-1 text-xs text-gray-600">
                            {excludedIngredientRows} ingredienten uitgesloten
                        </p>
                        <p className="mb-3 text-xs text-gray-600">
                            {fullyDiscardedMealCount} maaltijden volledig uitgesloten
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
                            disabled={busy || mode !== "firebase" || !discardedLoaded}
                            className="block w-full rounded-lg bg-red-600 py-3 text-center font-bold text-white shadow hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {busy ? "Bezig met versturen..." : "Stuur naar Bring"}
                        </button>

                        <button
                            type="button"
                            onClick={resetDiscardedForWeek}
                            className="mt-3 block w-full rounded-lg border border-gray-300 bg-white py-2 text-center text-sm font-medium text-gray-700 hover:bg-gray-50"
                        >
                            Herstel uitsluitingen voor deze week
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
