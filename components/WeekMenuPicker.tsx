"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { addDays, format, startOfWeek } from "date-fns";
import { nl } from "date-fns/locale";
import { useStore } from "@/context/StoreContext";
import type { MealType, Recipe } from "@/types";

const MEAL_TYPE_LABELS: Record<MealType, string> = {
    dinner: "Diner",
    lunch: "Lunch",
    other: "Anders",
};

interface WeekMenuPickerProps {
    recipe: Recipe | null;
    open: boolean;
    onClose: () => void;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
    return Array.from(
        container.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        )
    );
}

export default function WeekMenuPicker({
    recipe,
    open,
    onClose,
}: WeekMenuPickerProps) {
    const { mealPlan, recipes, addToMealPlan } = useStore();
    const [currentDate, setCurrentDate] = useState(() => new Date());
    const [mealType, setMealType] = useState<MealType>("dinner");
    const [servingsInput, setServingsInput] = useState("");
    const [busyDate, setBusyDate] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const dialogRef = useRef<HTMLDivElement>(null);
    const closeButtonRef = useRef<HTMLButtonElement>(null);
    const onCloseRef = useRef(onClose);
    const busyDateRef = useRef(busyDate);
    const titleId = useId();
    const descriptionId = useId();
    const recipeId = recipe?.id;
    const recipeBaseServings = recipe?.baseServings;

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        busyDateRef.current = busyDate;
    }, [busyDate]);

    useEffect(() => {
        if (!successMessage) {
            return;
        }

        const timeoutId = window.setTimeout(() => setSuccessMessage(null), 3500);
        return () => window.clearTimeout(timeoutId);
    }, [successMessage]);

    useEffect(() => {
        if (!open || !recipeId || recipeBaseServings === undefined) {
            return;
        }

        setCurrentDate(new Date());
        setMealType("dinner");
        setServingsInput(String(recipeBaseServings));
        setBusyDate(null);
        setError(null);

        const previouslyFocusedElement =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const previousBodyOverflow = document.body.style.overflow;
        const previousHtmlOverflow = document.documentElement.style.overflow;
        document.body.style.overflow = "hidden";
        document.documentElement.style.overflow = "hidden";

        const focusTimeoutId = window.setTimeout(() => closeButtonRef.current?.focus(), 0);

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                if (!busyDateRef.current) {
                    onCloseRef.current();
                }
                return;
            }

            if (event.key !== "Tab" || !dialogRef.current) {
                return;
            }

            const focusableElements = getFocusableElements(dialogRef.current);
            if (focusableElements.length === 0) {
                event.preventDefault();
                return;
            }

            const firstElement = focusableElements[0];
            const lastElement = focusableElements[focusableElements.length - 1];
            if (event.shiftKey && document.activeElement === firstElement) {
                event.preventDefault();
                lastElement.focus();
            } else if (!event.shiftKey && document.activeElement === lastElement) {
                event.preventDefault();
                firstElement.focus();
            }
        };

        document.addEventListener("keydown", handleKeyDown);

        return () => {
            window.clearTimeout(focusTimeoutId);
            document.removeEventListener("keydown", handleKeyDown);
            document.body.style.overflow = previousBodyOverflow;
            document.documentElement.style.overflow = previousHtmlOverflow;
            previouslyFocusedElement?.focus();
        };
    }, [open, recipeId, recipeBaseServings]);

    const startDate = startOfWeek(currentDate, { weekStartsOn: 1 });
    const days = useMemo(
        () => Array.from({ length: 7 }, (_, index) => addDays(startDate, index)),
        [startDate]
    );
    const recipesById = useMemo(
        () => new Map(recipes.map((item) => [item.id, item])),
        [recipes]
    );

    if (!open || !recipe) {
        return successMessage ? (
            <div
                role="status"
                aria-live="polite"
                className="fixed bottom-20 left-1/2 z-[90] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-lg bg-green-700 px-4 py-3 text-center text-sm font-semibold text-white shadow-lg"
            >
                {successMessage}
            </div>
        ) : null;
    }

    const requestClose = () => {
        if (!busyDate) {
            onCloseRef.current();
        }
    };

    const handleSelectDay = async (date: Date) => {
        const servings = Number.parseInt(servingsInput, 10);
        if (!Number.isInteger(servings) || servings < 1) {
            setError("Personen moet een geheel getal van minimaal 1 zijn.");
            return;
        }

        const dateKey = format(date, "yyyy-MM-dd");
        const dayLabel = format(date, "EEEE d MMMM yyyy", { locale: nl });
        const existingEntry = mealPlan.find(
            (entry) => entry.date === dateKey && entry.mealType === mealType
        );

        if (existingEntry) {
            const existingTitle =
                recipesById.get(existingEntry.recipeId)?.title ?? "Onbekend recept";
            const shouldReplace = confirm(
                `Op ${dayLabel} staat al '${existingTitle}' voor ${MEAL_TYPE_LABELS[mealType]}. ` +
                `Wil je dit slot bijwerken met '${recipe.title}'?`
            );
            if (!shouldReplace) {
                return;
            }
        }

        setBusyDate(dateKey);
        setError(null);
        try {
            await addToMealPlan({
                date: dateKey,
                recipeId: recipe.id,
                servings,
                mealType,
            });
            setSuccessMessage(
                `${recipe.title} is toegevoegd aan ${format(date, "EEEE d MMMM", { locale: nl })}.`
            );
            onCloseRef.current();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Toevoegen aan het weekmenu is mislukt.");
        } finally {
            setBusyDate(null);
        }
    };

    const endDate = days[6];
    const weekLabel =
        startDate.getFullYear() === endDate.getFullYear()
            ? `${format(startDate, "d MMM", { locale: nl })} – ${format(endDate, "d MMM yyyy", { locale: nl })}`
            : `${format(startDate, "d MMM yyyy", { locale: nl })} – ${format(endDate, "d MMM yyyy", { locale: nl })}`;

    return (
        <>
            <div
                className="fixed inset-0 z-[80] flex items-end justify-center"
            >
                <button
                    type="button"
                    tabIndex={-1}
                    aria-label="Weekmenu sluiten"
                    onClick={requestClose}
                    className="absolute inset-0 cursor-default bg-black/35"
                />
                <div
                    ref={dialogRef}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby={titleId}
                    aria-describedby={descriptionId}
                    className="relative z-10 max-h-[88vh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-3xl bg-white px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-3 shadow-2xl"
                >
                    <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-300" aria-hidden="true" />
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <h2 id={titleId} className="text-lg font-bold text-gray-900">
                                Toevoegen aan weekmenu
                            </h2>
                            <p id={descriptionId} className="mt-0.5 truncate text-sm text-gray-600">
                                {recipe.title}
                            </p>
                        </div>
                        <button
                            ref={closeButtonRef}
                            type="button"
                            onClick={requestClose}
                            disabled={Boolean(busyDate)}
                            className="min-h-11 rounded-lg px-3 text-sm font-semibold text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
                        >
                            Sluit
                        </button>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                        <div>
                            <span className="mb-1 block text-xs font-medium text-gray-600">
                                Maaltijd
                            </span>
                            <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Maaltijdtype">
                                {(Object.keys(MEAL_TYPE_LABELS) as MealType[]).map((type) => (
                                    <button
                                        key={type}
                                        type="button"
                                        role="radio"
                                        aria-checked={mealType === type}
                                        onClick={() => {
                                            setMealType(type);
                                            setError(null);
                                        }}
                                        disabled={Boolean(busyDate)}
                                        className={`min-h-9 rounded-full border px-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-green-500 ${
                                            mealType === type
                                                ? "border-green-600 bg-green-600 text-white"
                                                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                                        }`}
                                    >
                                        {MEAL_TYPE_LABELS[type]}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label
                                htmlFor="week-menu-servings"
                                className="mb-1 block text-xs font-medium text-gray-600"
                            >
                                Personen
                            </label>
                            <input
                                id="week-menu-servings"
                                type="number"
                                min={1}
                                step={1}
                                inputMode="numeric"
                                value={servingsInput}
                                onChange={(event) => {
                                    setServingsInput(event.target.value);
                                    setError(null);
                                }}
                                disabled={Boolean(busyDate)}
                                className="min-h-11 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/30"
                            />
                        </div>
                    </div>

                    <div className="mt-5 flex items-center justify-between rounded-xl bg-gray-50 p-1">
                        <button
                            type="button"
                            aria-label="Vorige week"
                            onClick={() => setCurrentDate((date) => addDays(date, -7))}
                            disabled={Boolean(busyDate)}
                            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-xl text-gray-600 hover:bg-white focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
                        >
                            ‹
                        </button>
                        <p className="px-2 text-center text-sm font-bold capitalize text-gray-800">
                            {weekLabel}
                        </p>
                        <button
                            type="button"
                            aria-label="Volgende week"
                            onClick={() => setCurrentDate((date) => addDays(date, 7))}
                            disabled={Boolean(busyDate)}
                            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-xl text-gray-600 hover:bg-white focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
                        >
                            ›
                        </button>
                    </div>

                    {error ? (
                        <p
                            role="alert"
                            className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                        >
                            {error}
                        </p>
                    ) : null}

                    <div className="mt-3 space-y-2">
                        {days.map((day) => {
                            const dateKey = format(day, "yyyy-MM-dd");
                            const existingEntry = mealPlan.find(
                                (entry) => entry.date === dateKey && entry.mealType === mealType
                            );
                            const existingTitle = existingEntry
                                ? recipesById.get(existingEntry.recipeId)?.title ?? "Onbekend recept"
                                : null;
                            const isBusy = busyDate === dateKey;

                            return (
                                <button
                                    key={dateKey}
                                    type="button"
                                    onClick={() => void handleSelectDay(day)}
                                    disabled={Boolean(busyDate)}
                                    className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left shadow-sm transition hover:border-green-300 hover:bg-green-50 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-60"
                                >
                                    <span className="min-w-0">
                                        <span className="block font-semibold capitalize text-gray-900">
                                            {format(day, "EEEE d MMMM", { locale: nl })}
                                        </span>
                                        <span
                                            className={`mt-0.5 block truncate text-xs ${
                                                existingTitle ? "text-amber-700" : "text-gray-500"
                                            }`}
                                        >
                                            {existingTitle
                                                ? `${MEAL_TYPE_LABELS[mealType]}: ${existingTitle}`
                                                : `${MEAL_TYPE_LABELS[mealType]} is vrij`}
                                        </span>
                                    </span>
                                    <span className="shrink-0 text-xs font-bold text-green-700">
                                        {isBusy ? "Opslaan..." : "Kies"}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {successMessage ? (
                <div
                    role="status"
                    aria-live="polite"
                    className="fixed bottom-20 left-1/2 z-[90] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-lg bg-green-700 px-4 py-3 text-center text-sm font-semibold text-white shadow-lg"
                >
                    {successMessage}
                </div>
            ) : null}
        </>
    );
}
