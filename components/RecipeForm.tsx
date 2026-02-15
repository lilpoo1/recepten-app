"use client";

import { ChangeEvent, FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import NextImage from "next/image";
import { useStore } from "@/context/StoreContext";
import { Ingredient, Recipe } from "@/types";

const MAX_IMAGE_DATA_URL_LENGTH = 350 * 1024;
const MAX_IMAGE_DIMENSIONS = [1280, 1024, 800] as const;
const JPEG_QUALITIES = [0.8, 0.7, 0.6] as const;

interface EditableIngredientRow {
    id: string;
    name: string;
    unit: string;
    amountInput: string;
}

interface EditableStepRow {
    id: string;
    text: string;
}

function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === "string") {
                resolve(reader.result);
                return;
            }
            reject(new Error("Kon afbeelding niet lezen."));
        };
        reader.onerror = () => reject(new Error("Kon afbeelding niet lezen."));
        reader.readAsDataURL(file);
    });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new window.Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Kon afbeelding niet laden."));
        image.src = src;
    });
}

async function compressImageFile(file: File): Promise<string> {
    if (!file.type.startsWith("image/")) {
        throw new Error("Kies een geldig afbeeldingsbestand.");
    }

    const sourceDataUrl = await readFileAsDataUrl(file);
    const sourceImage = await loadImageElement(sourceDataUrl);

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) {
        throw new Error("Kon afbeelding niet verwerken.");
    }

    for (const maxDimension of MAX_IMAGE_DIMENSIONS) {
        const longestSide = Math.max(sourceImage.naturalWidth, sourceImage.naturalHeight);
        const scale = longestSide > maxDimension ? maxDimension / longestSide : 1;
        const width = Math.max(1, Math.round(sourceImage.naturalWidth * scale));
        const height = Math.max(1, Math.round(sourceImage.naturalHeight * scale));

        canvas.width = width;
        canvas.height = height;

        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        context.drawImage(sourceImage, 0, 0, width, height);

        for (const quality of JPEG_QUALITIES) {
            const candidate = canvas.toDataURL("image/jpeg", quality);
            if (candidate.length <= MAX_IMAGE_DATA_URL_LENGTH) {
                return candidate;
            }
        }
    }

    throw new Error("Afbeelding is te groot. Kies een kleinere foto.");
}

function parseOptionalAmount(rawValue: string): number | null {
    const normalized = rawValue.trim();
    if (!normalized) {
        return 0;
    }

    const parsed = Number.parseFloat(normalized.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return null;
    }

    return parsed;
}

function toAmountInput(amount: number): string {
    if (!Number.isFinite(amount) || amount <= 0) {
        return "";
    }

    return String(amount);
}

export default function RecipeForm({ initialRecipe }: { initialRecipe?: Recipe }) {
    const { addRecipe, updateRecipe } = useStore();
    const router = useRouter();
    const rowCounterRef = useRef(0);

    const [title, setTitle] = useState(initialRecipe?.title ?? "");
    const [prepTimeInput, setPrepTimeInput] = useState(String(initialRecipe?.prepTimeMinutes ?? 30));
    const [difficulty, setDifficulty] = useState(initialRecipe?.difficulty ?? 3);
    const [baseServingsInput, setBaseServingsInput] = useState(String(initialRecipe?.baseServings ?? 2));
    const [ingredients, setIngredients] = useState<EditableIngredientRow[]>(
        (initialRecipe?.ingredients ?? []).map((ingredient, index) => ({
            id: `ingredient-${index}`,
            name: ingredient.name,
            unit: ingredient.unit,
            amountInput: toAmountInput(ingredient.amount),
        }))
    );
    const [steps, setSteps] = useState<EditableStepRow[]>(
        (initialRecipe?.steps ?? []).map((step, index) => ({
            id: `step-${index}`,
            text: step,
        }))
    );
    const [image, setImage] = useState<string | undefined>(initialRecipe?.image);
    const [newIngredient, setNewIngredient] = useState({ name: "", amount: "", unit: "" });
    const [newStep, setNewStep] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [imageBusy, setImageBusy] = useState(false);

    const clearError = () => {
        if (error) {
            setError(null);
        }
    };

    const createRowId = (prefix: "ingredient" | "step") => {
        rowCounterRef.current += 1;
        return `${prefix}-new-${rowCounterRef.current}`;
    };

    const handleImageSelected = async (event: ChangeEvent<HTMLInputElement>) => {
        clearError();
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }

        setImageBusy(true);
        try {
            const compressed = await compressImageFile(file);
            setImage(compressed);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Afbeelding uploaden mislukt.");
        } finally {
            setImageBusy(false);
            event.target.value = "";
        }
    };

    const handleRemoveImage = () => {
        clearError();
        setImage(undefined);
    };

    const addIngredient = () => {
        clearError();

        const name = newIngredient.name.trim();
        if (!name) {
            setError("Vul een ingredientnaam in.");
            return;
        }

        const parsedAmount = parseOptionalAmount(newIngredient.amount);
        if (parsedAmount === null) {
            setError("Hoeveelheid moet leeg zijn of groter dan 0.");
            return;
        }

        setIngredients((prev) => [
            ...prev,
            {
                id: createRowId("ingredient"),
                name,
                unit: newIngredient.unit.trim(),
                amountInput: parsedAmount > 0 ? String(parsedAmount) : "",
            },
        ]);
        setNewIngredient({ name: "", amount: "", unit: "" });
    };

    const addStep = () => {
        clearError();
        if (!newStep.trim()) {
            setError("Vul eerst een stapbeschrijving in.");
            return;
        }

        setSteps((prev) => [...prev, { id: createRowId("step"), text: newStep.trim() }]);
        setNewStep("");
    };

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);
        setBusy(true);

        try {
            const normalizedTitle = title.trim();
            if (!normalizedTitle) {
                throw new Error("Titel is verplicht.");
            }

            const parsedPrepTime = Number.parseInt(prepTimeInput, 10);
            if (!Number.isInteger(parsedPrepTime) || parsedPrepTime < 1) {
                throw new Error("Tijd moet een geheel getal van minimaal 1 zijn.");
            }

            const parsedBaseServings = Number.parseInt(baseServingsInput, 10);
            if (!Number.isInteger(parsedBaseServings) || parsedBaseServings < 1) {
                throw new Error("Personen moet een geheel getal van minimaal 1 zijn.");
            }

            if (ingredients.length === 0) {
                throw new Error("Voeg minimaal 1 ingredient toe.");
            }

            const normalizedIngredients: Ingredient[] = ingredients.map((ingredient, index) => {
                const name = ingredient.name.trim();
                if (!name) {
                    throw new Error(`Controleer ingredient ${index + 1}: naam is verplicht.`);
                }

                const parsedAmount = parseOptionalAmount(ingredient.amountInput);
                if (parsedAmount === null) {
                    throw new Error(
                        `Controleer ingredient ${index + 1}: hoeveelheid moet leeg zijn of groter dan 0.`
                    );
                }

                return {
                    name,
                    unit: ingredient.unit.trim(),
                    amount: parsedAmount,
                };
            });

            const normalizedSteps = steps.map((step) => step.text.trim()).filter(Boolean);

            if (initialRecipe) {
                await updateRecipe({
                    ...initialRecipe,
                    title: normalizedTitle,
                    image,
                    ingredients: normalizedIngredients,
                    steps: normalizedSteps,
                    prepTimeMinutes: parsedPrepTime,
                    difficulty,
                    baseServings: parsedBaseServings,
                    updatedAt: Date.now(),
                });
                router.push(`/recipes/${initialRecipe.id}`);
            } else {
                await addRecipe({
                    title: normalizedTitle,
                    description: "",
                    image,
                    ingredients: normalizedIngredients,
                    steps: normalizedSteps,
                    prepTimeMinutes: parsedPrepTime,
                    difficulty,
                    tags: [],
                    baseServings: parsedBaseServings,
                    notes: "",
                });
                router.push("/");
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Opslaan mislukt.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6 p-4 pb-20">
            <div>
                <label className="block text-sm font-medium text-gray-700">Titel</label>
                <input
                    type="text"
                    required
                    value={title}
                    onChange={(event) => {
                        clearError();
                        setTitle(event.target.value);
                    }}
                    className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm"
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700">Upload foto</label>
                <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => void handleImageSelected(event)}
                    className="mt-1 block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-2"
                />
                {imageBusy ? <p className="mt-2 text-xs text-gray-500">Foto verwerken...</p> : null}
                {image ? (
                    <div className="mt-3 overflow-hidden rounded-lg border border-gray-200 bg-white">
                        <NextImage
                            src={image}
                            alt="Recept foto preview"
                            width={1280}
                            height={720}
                            unoptimized
                            className="h-40 w-full object-cover"
                        />
                        <div className="p-2">
                            <button
                                type="button"
                                onClick={handleRemoveImage}
                                className="text-sm font-medium text-red-600"
                            >
                                Verwijder foto
                            </button>
                        </div>
                    </div>
                ) : null}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                    <label className="block text-sm font-medium text-gray-700">Tijd (min)</label>
                    <input
                        type="number"
                        value={prepTimeInput}
                        min={1}
                        onChange={(event) => {
                            clearError();
                            setPrepTimeInput(event.target.value);
                        }}
                        className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Moeilijkheid</label>
                    <select
                        value={difficulty}
                        onChange={(event) => {
                            clearError();
                            setDifficulty(Number.parseInt(event.target.value, 10) as 1 | 2 | 3 | 4 | 5);
                        }}
                        className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm"
                    >
                        {[1, 2, 3, 4, 5].map((value) => (
                            <option key={value} value={value}>
                                {value}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Personen</label>
                    <input
                        type="number"
                        value={baseServingsInput}
                        min={1}
                        onChange={(event) => {
                            clearError();
                            setBaseServingsInput(event.target.value);
                        }}
                        className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm"
                    />
                </div>
            </div>

            <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Ingredienten</label>
                <div className="mb-2 space-y-2">
                    {ingredients.map((ingredient) => (
                        <div key={ingredient.id} className="rounded bg-gray-50 p-2 text-sm">
                            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)_auto] gap-2">
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="Aantal"
                                    value={ingredient.amountInput}
                                    onChange={(event) => {
                                        clearError();
                                        setIngredients((prev) =>
                                            prev.map((row) =>
                                                row.id === ingredient.id
                                                    ? { ...row, amountInput: event.target.value }
                                                    : row
                                            )
                                        );
                                    }}
                                    className="w-full min-w-0 rounded-md border border-gray-300 p-2 text-sm shadow-sm"
                                />
                                <input
                                    value={ingredient.unit}
                                    onChange={(event) => {
                                        clearError();
                                        setIngredients((prev) =>
                                            prev.map((row) =>
                                                row.id === ingredient.id ? { ...row, unit: event.target.value } : row
                                            )
                                        );
                                    }}
                                    className="w-full min-w-0 rounded-md border border-gray-300 p-2 text-sm shadow-sm"
                                />
                                <input
                                    value={ingredient.name}
                                    onChange={(event) => {
                                        clearError();
                                        setIngredients((prev) =>
                                            prev.map((row) =>
                                                row.id === ingredient.id ? { ...row, name: event.target.value } : row
                                            )
                                        );
                                    }}
                                    className="w-full min-w-0 rounded-md border border-gray-300 p-2 text-sm shadow-sm"
                                />
                                <button
                                    type="button"
                                    onClick={() => {
                                        clearError();
                                        setIngredients((prev) => prev.filter((row) => row.id !== ingredient.id));
                                    }}
                                    className="rounded-md px-2 text-red-500"
                                >
                                    x
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="space-y-2">
                    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)] gap-2">
                        <input
                            placeholder="Aantal"
                            type="text"
                            inputMode="decimal"
                            value={newIngredient.amount}
                            onChange={(event) => {
                                clearError();
                                setNewIngredient((prev) => ({ ...prev, amount: event.target.value }));
                            }}
                            className="w-full min-w-0 rounded-md border border-gray-300 p-2 text-sm shadow-sm"
                        />
                        <input
                            placeholder="Eenheid"
                            value={newIngredient.unit}
                            onChange={(event) => {
                                clearError();
                                setNewIngredient((prev) => ({ ...prev, unit: event.target.value }));
                            }}
                            className="w-full min-w-0 rounded-md border border-gray-300 p-2 text-sm shadow-sm"
                        />
                        <input
                            placeholder="Ingredient"
                            value={newIngredient.name}
                            onChange={(event) => {
                                clearError();
                                setNewIngredient((prev) => ({ ...prev, name: event.target.value }));
                            }}
                            className="w-full min-w-0 rounded-md border border-gray-300 p-2 text-sm shadow-sm"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={addIngredient}
                        className="w-full rounded-md bg-green-100 px-3 py-2 text-sm font-medium text-green-700"
                    >
                        Voeg ingredient toe
                    </button>
                </div>
            </div>

            <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Bereiding</label>
                <div className="mb-2 space-y-2">
                    {steps.map((step, index) => (
                        <div key={step.id} className="rounded bg-gray-50 p-2 text-sm">
                            <div className="flex items-start gap-2">
                                <span className="pt-2 font-bold text-gray-400">{index + 1}.</span>
                                <textarea
                                    value={step.text}
                                    onChange={(event) => {
                                        clearError();
                                        setSteps((prev) =>
                                            prev.map((row) =>
                                                row.id === step.id ? { ...row, text: event.target.value } : row
                                            )
                                        );
                                    }}
                                    rows={2}
                                    className="w-full min-w-0 rounded-md border border-gray-300 p-2 text-sm shadow-sm"
                                />
                                <button
                                    type="button"
                                    onClick={() => {
                                        clearError();
                                        setSteps((prev) => prev.filter((row) => row.id !== step.id));
                                    }}
                                    className="rounded-md px-2 text-red-500"
                                >
                                    x
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="space-y-2">
                    <textarea
                        placeholder="Stap beschrijving..."
                        value={newStep}
                        onChange={(event) => {
                            clearError();
                            setNewStep(event.target.value);
                        }}
                        className="w-full min-w-0 rounded-md border border-gray-300 p-2 text-sm shadow-sm"
                        rows={2}
                    />
                    <button
                        type="button"
                        onClick={addStep}
                        className="w-full rounded-md bg-green-100 px-3 py-2 text-sm font-medium text-green-700"
                    >
                        Voeg stap toe
                    </button>
                </div>
            </div>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <button
                type="submit"
                disabled={busy || imageBusy}
                className="w-full rounded-full bg-green-600 px-4 py-3 text-sm font-medium text-white shadow-sm hover:bg-green-700 disabled:opacity-60"
            >
                {busy ? "Opslaan..." : "Opslaan"}
            </button>
        </form>
    );
}
