export type UnitCategory = "weight" | "volume" | "count" | "other";

export interface HumanQuantity {
    rawAmount: number;
    roundedAmount: number;
    unit: string;
    category: UnitCategory;
    isApproximate: boolean;
    displayNumber: string;
    displayWithApprox: string;
    displayWithUnit: string;
}

const WEIGHT_UNITS = new Set(["g", "gram", "gr", "kg", "kilo"]);
const VOLUME_UNITS = new Set(["ml", "milliliter", "l", "liter"]);
const COUNT_UNITS = new Set([
    "",
    "stuk",
    "stuks",
    "teen",
    "teentje",
    "teentjes",
    "blad",
    "bladen",
    "blik",
    "blikje",
    "blikjes",
    "ui",
    "uien",
]);

function normalizeUnit(unit: string): string {
    return unit.trim().toLowerCase().replace(/\./g, "");
}

function roundToStep(value: number, step: number): number {
    if (step <= 0) {
        return value;
    }
    return Math.round(value / step) * step;
}

function formatNumber(value: number, locale: string, maximumFractionDigits: number): string {
    return new Intl.NumberFormat(locale, {
        maximumFractionDigits,
    }).format(value);
}

function getMaxFractionDigits(category: UnitCategory, normalizedUnit: string): number {
    if (category === "weight") {
        return normalizedUnit === "kg" || normalizedUnit === "kilo" ? 3 : 0;
    }
    if (category === "volume") {
        return normalizedUnit === "l" || normalizedUnit === "liter" ? 2 : 0;
    }
    if (category === "count") {
        return 1;
    }
    return 1;
}

export function classifyUnit(unit: string): UnitCategory {
    const normalized = normalizeUnit(unit);
    if (WEIGHT_UNITS.has(normalized)) {
        return "weight";
    }
    if (VOLUME_UNITS.has(normalized)) {
        return "volume";
    }
    if (COUNT_UNITS.has(normalized)) {
        return "count";
    }
    return "other";
}

export function toHumanQuantity(amount: number, unit: string, locale = "nl-NL"): HumanQuantity {
    const safeAmount = Number.isFinite(amount) ? amount : 0;
    const trimmedUnit = unit.trim();
    const normalizedUnit = normalizeUnit(unit);
    const category = classifyUnit(unit);

    let roundedAmount = safeAmount;

    if (category === "weight") {
        const multiplier = normalizedUnit === "kg" || normalizedUnit === "kilo" ? 1000 : 1;
        const baseAmount = safeAmount * multiplier;
        roundedAmount = roundToStep(baseAmount, 5) / multiplier;
    } else if (category === "volume") {
        const multiplier = normalizedUnit === "l" || normalizedUnit === "liter" ? 1000 : 1;
        const baseAmount = safeAmount * multiplier;
        roundedAmount = roundToStep(baseAmount, 10) / multiplier;
    } else if (category === "count") {
        const nearestInteger = Math.round(safeAmount);
        if (Math.abs(safeAmount - nearestInteger) <= 0.15) {
            roundedAmount = nearestInteger;
        } else {
            roundedAmount = roundToStep(safeAmount, 0.5);
        }
        if (safeAmount > 0 && roundedAmount < 1) {
            roundedAmount = 1;
        }
    } else {
        roundedAmount = Math.round(safeAmount * 10) / 10;
    }

    roundedAmount = Number.parseFloat(roundedAmount.toFixed(6));

    const isApproximate =
        safeAmount > 0 &&
        Math.abs(roundedAmount - safeAmount) / safeAmount > 0.1;
    const displayNumber = formatNumber(
        roundedAmount,
        locale,
        getMaxFractionDigits(category, normalizedUnit)
    );
    const displayWithApprox = `${isApproximate ? "± " : ""}${displayNumber}`;
    const displayWithUnit = trimmedUnit.length > 0 ? `${displayWithApprox} ${trimmedUnit}` : displayWithApprox;

    return {
        rawAmount: safeAmount,
        roundedAmount,
        unit: trimmedUnit,
        category,
        isApproximate,
        displayNumber,
        displayWithApprox,
        displayWithUnit,
    };
}
