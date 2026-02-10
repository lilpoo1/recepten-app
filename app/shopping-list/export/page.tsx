"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { endOfWeek, isWithinInterval, startOfWeek } from "date-fns";
import { ShoppingItem } from "@/types";
import { useStore } from "@/context/StoreContext";

function formatDate(value: number) {
    return new Date(value).toLocaleString("nl-NL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function ExportContent() {
    const searchParams = useSearchParams();
    const { mealPlan, recipes, mode, createBringShareSnapshot } = useStore();
    const [shareUrl, setShareUrl] = useState<string>("");
    const [expiresAt, setExpiresAt] = useState<number | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const startDate = useMemo(() => {
        const startParam = searchParams.get("start");
        if (!startParam) {
            return startOfWeek(new Date(), { weekStartsOn: 1 });
        }
        const parsed = new Date(startParam);
        return Number.isNaN(parsed.getTime())
            ? startOfWeek(new Date(), { weekStartsOn: 1 })
            : parsed;
    }, [searchParams]);

    const endDate = useMemo(() => endOfWeek(startDate, { weekStartsOn: 1 }), [startDate]);

    const shoppingList = useMemo(() => {
        const items: Record<string, ShoppingItem> = {};
        mealPlan.forEach((entry) => {
            const entryDate = new Date(entry.date);
            if (!isWithinInterval(entryDate, { start: startDate, end: endDate })) {
                return;
            }

            const recipe = recipes.find((item) => item.id === entry.recipeId);
            if (!recipe) {
                return;
            }

            const scaling = entry.servings / recipe.baseServings;
            recipe.ingredients.forEach((ingredient) => {
                const key = `${ingredient.name.toLowerCase().trim()}-${ingredient.unit
                    .toLowerCase()
                    .trim()}`;
                if (items[key]) {
                    items[key].amount += ingredient.amount * scaling;
                } else {
                    items[key] = {
                        name: ingredient.name,
                        amount: ingredient.amount * scaling,
                        unit: ingredient.unit,
                        checked: false,
                    };
                }
            });
        });
        return Object.values(items);
    }, [endDate, mealPlan, recipes, startDate]);

    const exportText = useMemo(
        () =>
            shoppingList
                .map((item) => `${Number.parseFloat(item.amount.toFixed(1))} ${item.unit} ${item.name}`)
                .join("\n"),
        [shoppingList]
    );

    const handleCopy = async (text: string, successMessage: string) => {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            alert(successMessage);
            return;
        }

        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
        alert(successMessage);
    };

    const handleGenerateLink = async () => {
        setBusy(true);
        setError(null);
        try {
            if (shoppingList.length === 0) {
                throw new Error("Er zijn geen boodschappen om te delen.");
            }

            const result = await createBringShareSnapshot({
                title: `Boodschappen ${startDate.toLocaleDateString("nl-NL")}`,
                items: shoppingList.map((item) => ({
                    name: item.name,
                    amount: Number.parseFloat(item.amount.toFixed(1)),
                    unit: item.unit,
                })),
                servings: 1,
                sourceWeekStart: startDate.toISOString(),
            });

            setShareUrl(result.url);
            setExpiresAt(result.expiresAt);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Link genereren mislukt.");
        } finally {
            setBusy(false);
        }
    };

    const handleShareLink = async () => {
        if (!shareUrl) {
            return;
        }
        if (navigator.share) {
            try {
                await navigator.share({
                    title: "Bring import link",
                    text: shareUrl,
                    url: shareUrl,
                });
                return;
            } catch {
                return;
            }
        }

        await handleCopy(shareUrl, "Bring-link gekopieerd.");
    };

    const handleShareListFallback = async () => {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: `Boodschappen ${startDate.toLocaleDateString("nl-NL")}`,
                    text: exportText,
                });
                return;
            } catch {
                return;
            }
        }

        await handleCopy(exportText, "Boodschappenlijst gekopieerd.");
    };

    return (
        <div className="min-h-screen bg-white p-6">
            <div className="mx-auto max-w-sm text-center">
                <h1 className="mb-4 text-2xl font-bold">Bring export</h1>

                <div className="mb-6 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
                    <strong>Let op:</strong> Bring-import vereist een publiek bereikbare URL.
                    {mode !== "firebase" ? (
                        <p className="mt-2 font-medium">
                            Firebase modus staat nu uit; linkgeneratie werkt pas op de gehoste omgeving.
                        </p>
                    ) : null}
                </div>

                <button
                    type="button"
                    onClick={() => void handleGenerateLink()}
                    disabled={busy || mode !== "firebase"}
                    className="mb-4 w-full rounded-lg bg-red-600 px-6 py-3 font-bold text-white shadow hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {busy ? "Link maken..." : "Genereer Bring-link"}
                </button>

                {error ? (
                    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-left text-sm text-red-700">
                        {error}
                    </div>
                ) : null}

                {shareUrl ? (
                    <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4 text-left text-sm text-green-900">
                        <p className="font-semibold">Bring-link klaar</p>
                        <p className="mt-1 break-all">{shareUrl}</p>
                        {expiresAt ? (
                            <p className="mt-2 text-xs text-green-700">
                                Verloopt op: {formatDate(expiresAt)}
                            </p>
                        ) : null}
                        <div className="mt-3 grid grid-cols-1 gap-2">
                            <a
                                href={shareUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-md bg-red-600 px-3 py-2 text-center font-semibold text-white"
                            >
                                Open Bring importpagina
                            </a>
                            <button
                                type="button"
                                onClick={() => void handleCopy(shareUrl, "Bring-link gekopieerd.")}
                                className="rounded-md border border-green-300 bg-white px-3 py-2 font-semibold text-green-800"
                            >
                                Kopieer link
                            </button>
                            <button
                                type="button"
                                onClick={() => void handleShareLink()}
                                className="rounded-md border border-green-300 bg-white px-3 py-2 font-semibold text-green-800"
                            >
                                Deel link
                            </button>
                        </div>
                    </div>
                ) : null}

                <div className="mb-4 rounded-lg bg-gray-100 p-4 text-left">
                    <h2 className="mb-2 font-bold">Jouw boodschappenlijst</h2>
                    <ul className="list-inside list-disc text-sm">
                        {shoppingList.map((item, index) => (
                            <li key={`${item.name}-${index}`}>
                                {Number.parseFloat(item.amount.toFixed(1))} {item.unit} {item.name}
                            </li>
                        ))}
                    </ul>
                </div>

                <button
                    type="button"
                    onClick={() => void handleShareListFallback()}
                    className="w-full rounded-lg bg-blue-600 px-6 py-3 font-bold text-white shadow hover:bg-blue-700"
                >
                    Deel lijst / kopieer tekst (fallback)
                </button>
            </div>
        </div>
    );
}

export default function ExportPage() {
    return (
        <Suspense fallback={<div>Laden...</div>}>
            <ExportContent />
        </Suspense>
    );
}
