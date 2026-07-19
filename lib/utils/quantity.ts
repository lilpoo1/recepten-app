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

export interface ParsedQuantityText {
    rawText: string;
    isParseable: boolean;
    amount?: number;
    unit?: string;
    rawRemainder?: string;
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

function toCompactNumber(value: number): string {
    const rounded = Number.parseFloat(value.toFixed(6));
    if (!Number.isFinite(rounded) || rounded <= 0) {
        return "";
    }
    return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

export function composeQuantityTextFromLegacy(amount: number, unit: string): string {
    const trimmedUnit = unit.trim();
    const amountText = toCompactNumber(amount);

    if (amountText) {
        return trimmedUnit ? `${amountText} ${trimmedUnit}` : amountText;
    }

    return trimmedUnit;
}

export function parseQuantityText(quantityText?: string): ParsedQuantityText {
    const rawText = (quantityText ?? "").trim();
    if (!rawText) {
        return {
            rawText: "",
            isParseable: false,
        };
    }

    const match = rawText.match(/^([0-9]+(?:[.,][0-9]+)?)\s*(.*)$/);
    if (!match) {
        return {
            rawText,
            isParseable: false,
            rawRemainder: rawText,
        };
    }

    const amount = Number.parseFloat(match[1].replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
        return {
            rawText,
            isParseable: false,
            rawRemainder: rawText,
        };
    }

    const unit = match[2].trim();

    return {
        rawText,
        isParseable: true,
        amount,
        unit,
        rawRemainder: unit || undefined,
    };
}

export function formatScaledQuantityText(
    quantityText: string | undefined,
    factor: number,
    locale = "nl-NL"
): string {
    const parsed = parseQuantityText(quantityText);
    if (!parsed.rawText) {
        return "";
    }

    if (!parsed.isParseable || parsed.amount === undefined) {
        return parsed.rawText;
    }

    const safeFactor = Number.isFinite(factor) && factor > 0 ? factor : 1;
    return toHumanQuantity(parsed.amount * safeFactor, parsed.unit ?? "", locale).displayWithUnit.trim();
}
