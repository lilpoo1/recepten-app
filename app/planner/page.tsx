"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { addDays, format, isSameDay, startOfWeek } from "date-fns";
import { nl } from "date-fns/locale";
import { MealPlanEntry, MealType } from "@/types";
import { useStore } from "@/context/StoreContext";

type RecipeSort = "last_eaten" | "time" | "name";

const MEAL_TYPE_ORDER: Record<MealType, number> = {
    lunch: 0,
    dinner: 1,
    other: 2,
};

const MEAL_TYPE_LABEL: Record<MealType, string> = {
    dinner: "Diner",
    lunch: "Lunch",
    other: "Anders",
};

export default function PlannerPage() {
    const { mealPlan, recipes, removeFromMealPlan, markAsCooked, addToMealPlan } = useStore();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [pickerDate, setPickerDate] = useState<string | null>(null);
    const [pickerSearchTerm, setPickerSearchTerm] = useState("");
    const [pickerSort, setPickerSort] = useState<RecipeSort>("last_eaten");
    const [pickerMealType, setPickerMealType] = useState<MealType>("dinner");
    const [pickerBusy, setPickerBusy] = useState(false);
    const [pickerError, setPickerError] = useState<string | null>(null);
    const [activeMealMenuId, setActiveMealMenuId] = useState<string | null>(null);
    const [moveMeal, setMoveMeal] = useState<MealPlanEntry | null>(null);
    const [moveBusy, setMoveBusy] = useState(false);
    const [moveError, setMoveError] = useState<string | null>(null);
    const isOverlayOpen = Boolean(pickerDate || moveMeal);

    const startDate = startOfWeek(currentDate, { weekStartsOn: 1 });
    const days = Array.from({ length: 7 }, (_, index) => addDays(startDate, index));
    const recipesById = useMemo(() => new Map(recipes.map((recipe) => [recipe.id, recipe])), [recipes]);
    const dayByKey = useMemo(
        () => new Map(days.map((day) => [format(day, "yyyy-MM-dd"), day])),
        [days]
    );

    const getMealsForDay = (date: Date) =>
        mealPlan
            .filter((entry) => isSameDay(new Date(entry.date), date))
            .sort((a, b) => MEAL_TYPE_ORDER[a.mealType] - MEAL_TYPE_ORDER[b.mealType]);

    const getRecipeName = (id: string) =>
        recipesById.get(id)?.title || "Onbekend recept";

    const formatDayLabel = (dateKey: string) => {
        const day = dayByKey.get(dateKey);
        return day ? format(day, "EEEE d MMM", { locale: nl }) : dateKey;
    };

    const handleCooked = async (recipeId: string, title: string) => {
        if (!confirm(`Markeer '${title}' als gekookt?`)) {
            return;
        }
        await markAsCooked(recipeId);
        setActiveMealMenuId(null);
    };

    const openRecipePicker = (dateKey: string) => {
        setPickerDate(dateKey);
        setPickerSearchTerm("");
        setPickerSort("last_eaten");
        setPickerMealType("dinner");
        setPickerError(null);
        setMoveMeal(null);
        setActiveMealMenuId(null);
    };

    const closeRecipePicker = () => {
        if (pickerBusy) {
            return;
        }
        setPickerDate(null);
        setPickerError(null);
    };

    const filteredRecipes = useMemo(() => {
        const query = pickerSearchTerm.trim().toLowerCase();
        const subset = recipes.filter((recipe) =>
            recipe.title.toLowerCase().includes(query)
        );

        return subset.sort((a, b) => {
            switch (pickerSort) {
                case "name":
                    return a.title.localeCompare(b.title);
                case "time":
                    return (a.prepTimeMinutes || 0) - (b.prepTimeMinutes || 0);
                case "last_eaten":
                default:
                    const lastA = a.cookingHistory?.length ? Math.max(...a.cookingHistory) : 0;
                    const lastB = b.cookingHistory?.length ? Math.max(...b.cookingHistory) : 0;
                    return lastA - lastB;
            }
        });
    }, [pickerSearchTerm, pickerSort, recipes]);

    const handleQuickAssign = async (recipeId: string) => {
        if (!pickerDate) {
            return;
        }

        const recipe = recipesById.get(recipeId);
        if (!recipe) {
            return;
        }

        setPickerBusy(true);
        setPickerError(null);
        try {
            await addToMealPlan({
                date: pickerDate,
                recipeId: recipe.id,
                servings: recipe.baseServings,
                mealType: pickerMealType,
            });
            setPickerDate(null);
        } catch (err) {
            setPickerError(err instanceof Error ? err.message : "Toevoegen mislukt.");
        } finally {
            setPickerBusy(false);
        }
    };

    const openMovePicker = (meal: MealPlanEntry) => {
        setMoveMeal(meal);
        setMoveError(null);
        setPickerDate(null);
        setActiveMealMenuId(null);
    };

    const closeMovePicker = () => {
        if (moveBusy) {
            return;
        }
        setMoveMeal(null);
        setMoveError(null);
    };

    const moveTargets = useMemo(() => {
        if (!moveMeal) {
            return [];
        }
        return days
            .map((day) => format(day, "yyyy-MM-dd"))
            .filter((dateKey) => dateKey !== moveMeal.date);
    }, [days, moveMeal]);

    useEffect(() => {
        if (typeof window === "undefined" || !isOverlayOpen) {
            return;
        }

        const previousBodyOverflow = document.body.style.overflow;
        const previousHtmlOverflow = document.documentElement.style.overflow;
        document.body.style.overflow = "hidden";
        document.documentElement.style.overflow = "hidden";

        return () => {
            document.body.style.overflow = previousBodyOverflow;
            document.documentElement.style.overflow = previousHtmlOverflow;
        };
    }, [isOverlayOpen]);

    const handleMoveMeal = async (targetDate: string) => {
        if (!moveMeal) {
            return;
        }

        const conflictingEntry = mealPlan.find(
            (entry) => entry.date === targetDate && entry.mealType === moveMeal.mealType
        );

        if (conflictingEntry) {
            const destinationLabel = formatDayLabel(targetDate);
            const conflictTitle = getRecipeName(conflictingEntry.recipeId);
            const shouldReplace = confirm(
                `Op ${destinationLabel} staat al '${conflictTitle}' voor ${MEAL_TYPE_LABEL[moveMeal.mealType]}. Wil je deze vervangen?`
            );
            if (!shouldReplace) {
                return;
            }
        }

        setMoveBusy(true);
        setMoveError(null);

        try {
            await addToMealPlan({
                date: targetDate,
                recipeId: moveMeal.recipeId,
                servings: moveMeal.servings,
                mealType: moveMeal.mealType,
            });
            await removeFromMealPlan(moveMeal.date, moveMeal.recipeId, moveMeal.mealType);
            setMoveMeal(null);
        } catch (err) {
            setMoveError(err instanceof Error ? err.message : "Verplaatsen mislukt.");
        } finally {
            setMoveBusy(false);
        }
    };

    const nextWeek = () => setCurrentDate(addDays(currentDate, 7));
    const prevWeek = () => setCurrentDate(addDays(currentDate, -7));

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
                <span className="text-lg font-bold capitalize">
                    {format(startDate, "MMMM yyyy", { locale: nl })}
                </span>
                <button
                    type="button"
                    onClick={nextWeek}
                    aria-label="Volgende week"
                    className="p-2 text-gray-600"
                >
                    <Image src="/right-chevron-icon.svg" alt="" aria-hidden="true" width={16} height={16} className="h-4 w-4" />
                </button>
            </div>

            <div className="space-y-4 p-4">
                {days.map((day) => {
                    const meals = getMealsForDay(day);
                    const dateStr = format(day, "yyyy-MM-dd");
                    const dayLabel = format(day, "EEEE d MMM", { locale: nl });

                    return (
                        <div
                            key={dateStr}
                            className="rounded-lg border border-gray-100 bg-white shadow-sm"
                        >
                            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-2">
                                <span className="font-semibold capitalize text-gray-700">
                                    {dayLabel}
                                </span>
                                {meals.length > 0 ? (
                                    <button
                                        type="button"
                                        onClick={() => openRecipePicker(dateStr)}
                                        aria-label={`Maaltijd kiezen voor ${dayLabel}`}
                                        className="rounded px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-100"
                                    >
                                        Toevoegen
                                    </button>
                                ) : null}
                            </div>
                            <div className="space-y-2 p-2">
                                {meals.length === 0 ? (
                                    <button
                                        type="button"
                                        onClick={() => openRecipePicker(dateStr)}
                                        aria-label={`Maaltijd kiezen voor ${dayLabel}`}
                                        className="flex w-full min-h-11 items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-left hover:bg-gray-100"
                                    >
                                        <span
                                            aria-hidden="true"
                                            className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-gray-300 bg-white text-sm font-bold leading-none text-gray-500"
                                        >
                                            +
                                        </span>
                                        <span className="flex-1 text-sm font-medium text-gray-700">
                                            Maaltijd kiezen
                                        </span>
                                        <Image
                                            src="/right-chevron-icon.svg"
                                            alt=""
                                            aria-hidden="true"
                                            width={14}
                                            height={14}
                                            className="h-3.5 w-3.5 opacity-60"
                                        />
                                    </button>
                                ) : (
                                    meals.map((meal) => {
                                        const title = getRecipeName(meal.recipeId);
                                        const menuOpen = activeMealMenuId === meal.id;
                                        return (
                                            <div
                                                key={meal.id}
                                                className="group flex items-center justify-between rounded bg-green-50 p-2 text-sm"
                                            >
                                                <div className="flex flex-1 flex-col">
                                                    <span className="font-medium text-gray-800">{title}</span>
                                                    <span className="text-xs capitalize text-gray-500">
                                                        {MEAL_TYPE_LABEL[meal.mealType]} | {meal.servings} pers.
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1 relative">
                                                    <button
                                                        onClick={() => void handleCooked(meal.recipeId, title)}
                                                        className="rounded border border-green-200 bg-white px-2 py-1 text-xs text-green-600 shadow-sm hover:bg-green-100"
                                                        title="Markeer als gegeten"
                                                    >
                                                        Klaar
                                                    </button>
                                                    <button
                                                        onClick={() =>
                                                            void removeFromMealPlan(
                                                                meal.date,
                                                                meal.recipeId,
                                                                meal.mealType
                                                            )
                                                        }
                                                        className="px-2 font-bold text-gray-400 hover:text-red-500"
                                                    >
                                                        x
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setActiveMealMenuId((current) =>
                                                                current === meal.id ? null : meal.id
                                                            )
                                                        }
                                                        className="rounded px-2 font-bold text-gray-500 hover:bg-white hover:text-gray-700"
                                                    >
                                                        ...
                                                    </button>
                                                    {menuOpen ? (
                                                        <div className="absolute right-0 top-8 z-30 w-36 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                                                            <button
                                                                type="button"
                                                                onClick={() => openMovePicker(meal)}
                                                                className="block w-full px-3 py-2 text-left text-xs font-medium text-gray-700 hover:bg-gray-50"
                                                            >
                                                                Verplaats naar...
                                                            </button>
                                                        </div>
                                                    ) : null}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {pickerDate ? (
                <div className="fixed inset-0 z-[80] flex items-end" onClick={closeRecipePicker}>
                    <div className="absolute inset-0 bg-black/30" />
                    <div
                        className="relative z-10 w-full max-h-[85vh] overflow-y-auto overscroll-contain rounded-t-2xl bg-white p-4 shadow-xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="mb-2 flex items-center justify-between">
                            <h2 className="text-lg font-bold text-gray-900">Kies recept</h2>
                            <button
                                type="button"
                                onClick={closeRecipePicker}
                                className="rounded px-2 py-1 text-sm text-gray-500 hover:bg-gray-100"
                            >
                                Sluit
                            </button>
                        </div>
                        <p className="mb-3 text-xs text-gray-500">
                            Plan voor {formatDayLabel(pickerDate)}
                        </p>

                        <input
                            type="text"
                            placeholder="Zoek recept..."
                            value={pickerSearchTerm}
                            onChange={(event) => setPickerSearchTerm(event.target.value)}
                            className="w-full rounded-lg bg-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                        />

                        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 text-xs">
                            <button
                                type="button"
                                onClick={() => setPickerSort("last_eaten")}
                                className={`whitespace-nowrap rounded-full border px-3 py-1 font-medium ${pickerSort === "last_eaten"
                                    ? "border-green-200 bg-green-100 text-green-700"
                                    : "border-gray-200 bg-white text-gray-600"
                                    }`}
                            >
                                Langst geleden
                            </button>
                            <button
                                type="button"
                                onClick={() => setPickerSort("time")}
                                className={`whitespace-nowrap rounded-full border px-3 py-1 font-medium ${pickerSort === "time"
                                    ? "border-green-200 bg-green-100 text-green-700"
                                    : "border-gray-200 bg-white text-gray-600"
                                    }`}
                            >
                                Snelste
                            </button>
                            <button
                                type="button"
                                onClick={() => setPickerSort("name")}
                                className={`whitespace-nowrap rounded-full border px-3 py-1 font-medium ${pickerSort === "name"
                                    ? "border-green-200 bg-green-100 text-green-700"
                                    : "border-gray-200 bg-white text-gray-600"
                                    }`}
                            >
                                A-Z
                            </button>
                        </div>

                        <div className="mt-2 flex gap-2 overflow-x-auto pb-1 text-xs">
                            {(["dinner", "lunch", "other"] as MealType[]).map((mealType) => (
                                <button
                                    key={mealType}
                                    type="button"
                                    onClick={() => setPickerMealType(mealType)}
                                    className={`whitespace-nowrap rounded-full border px-3 py-1 font-medium ${pickerMealType === mealType
                                        ? "border-green-200 bg-green-100 text-green-700"
                                        : "border-gray-200 bg-white text-gray-600"
                                        }`}
                                >
                                    {MEAL_TYPE_LABEL[mealType]}
                                </button>
                            ))}
                        </div>

                        {pickerError ? (
                            <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                                {pickerError}
                            </p>
                        ) : null}

                        <div className="mt-3 space-y-2 pr-1">
                            {filteredRecipes.length === 0 ? (
                                <p className="py-4 text-center text-sm text-gray-500">
                                    Geen recepten gevonden.
                                </p>
                            ) : (
                                filteredRecipes.map((recipe) => (
                                    <button
                                        key={recipe.id}
                                        type="button"
                                        onClick={() => void handleQuickAssign(recipe.id)}
                                        disabled={pickerBusy}
                                        className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-3 text-left shadow-sm hover:bg-gray-50 disabled:opacity-60"
                                    >
                                        <div className="min-w-0">
                                            <p className="truncate font-semibold text-gray-800">{recipe.title}</p>
                                            <p className="mt-1 text-xs text-gray-500">
                                                Tijd {recipe.prepTimeMinutes ?? "-"}m | Basis {recipe.baseServings} pers.
                                            </p>
                                        </div>
                                        <span className="ml-3 text-xs font-semibold text-green-700">
                                            {pickerBusy ? "Opslaan..." : "Kies"}
                                        </span>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            ) : null}

            {moveMeal ? (
                <div className="fixed inset-0 z-[80] flex items-end" onClick={closeMovePicker}>
                    <div className="absolute inset-0 bg-black/30" />
                    <div
                        className="relative z-10 w-full max-h-[70vh] overflow-y-auto overscroll-contain rounded-t-2xl bg-white p-4 shadow-xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="mb-2 flex items-center justify-between">
                            <h2 className="text-lg font-bold text-gray-900">Verplaats naar...</h2>
                            <button
                                type="button"
                                onClick={closeMovePicker}
                                className="rounded px-2 py-1 text-sm text-gray-500 hover:bg-gray-100"
                            >
                                Sluit
                            </button>
                        </div>
                        <p className="mb-3 text-xs text-gray-500">
                            {getRecipeName(moveMeal.recipeId)} | {MEAL_TYPE_LABEL[moveMeal.mealType]} | {moveMeal.servings} pers.
                        </p>

                        {moveError ? (
                            <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                                {moveError}
                            </p>
                        ) : null}

                        <div className="space-y-2 overflow-y-auto">
                            {moveTargets.map((dateKey) => (
                                <button
                                    key={dateKey}
                                    type="button"
                                    onClick={() => void handleMoveMeal(dateKey)}
                                    disabled={moveBusy}
                                    className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-3 text-left shadow-sm hover:bg-gray-50 disabled:opacity-60"
                                >
                                    <span className="font-medium capitalize text-gray-800">
                                        {formatDayLabel(dateKey)}
                                    </span>
                                    <span className="text-xs font-semibold text-green-700">
                                        {moveBusy ? "Bezig..." : "Kies"}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
