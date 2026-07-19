import { BringShareItem, BringShareSnapshot } from "@/types";
import { composeQuantityTextFromLegacy } from "@/lib/utils/quantity";

interface FirestoreField {
    stringValue?: string;
    integerValue?: string;
    doubleValue?: number;
    timestampValue?: string;
    arrayValue?: {
        values?: Array<{
            mapValue?: {
                fields?: Record<string, FirestoreField>;
            };
        }>;
    };
}

interface FirestoreDocumentResponse {
    fields?: Record<string, FirestoreField>;
}

function getString(fields: Record<string, FirestoreField>, key: string): string {
    return fields[key]?.stringValue ?? "";
}

function getNumber(fields: Record<string, FirestoreField>, key: string): number {
    const field = fields[key];
    if (!field) {
        return 0;
    }
    if (typeof field.doubleValue === "number") {
        return field.doubleValue;
    }
    if (typeof field.integerValue === "string") {
        const parsed = Number(field.integerValue);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
}

function getTimestamp(fields: Record<string, FirestoreField>, key: string): number {
    const value = fields[key]?.timestampValue;
    if (!value) {
        return 0;
    }
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
}

function getItems(fields: Record<string, FirestoreField>, key: string): BringShareItem[] {
    const values = fields[key]?.arrayValue?.values ?? [];
    return values
        .map((item) => {
            const mapFields = item.mapValue?.fields ?? {};
            const legacyAmount =
                typeof mapFields.amount?.doubleValue === "number"
                    ? mapFields.amount.doubleValue
                    : Number(mapFields.amount?.integerValue ?? "0");
            const legacyUnit = mapFields.unit?.stringValue ?? "";
            const quantityText =
                mapFields.quantityText?.stringValue?.trim() ??
                composeQuantityTextFromLegacy(legacyAmount, legacyUnit);
            const name = (mapFields.name?.stringValue ?? "").trim();

            if (!name) {
                return null;
            }

            return quantityText ? { name, quantityText } : { name };
        })
        .filter((item): item is BringShareItem => Boolean(item));
}

export interface BringImportItem {
    itemId: string;
    spec?: string;
}

export interface BringImportPayload {
    schema: "bring.importer/v1";
    items: BringImportItem[];
}

export function toBringImportItem(item: BringShareItem): BringImportItem {
    const itemId = item.name.trim();
    const spec = (item.quantityText ?? "").trim();
    return spec ? { itemId, spec } : { itemId };
}

export function toBringImportPayload(snapshot: BringShareSnapshot): BringImportPayload {
    return {
        schema: "bring.importer/v1",
        items: snapshot.items.map((item) => toBringImportItem(item)),
    };
}

export async function fetchBringShareSnapshot(token: string): Promise<BringShareSnapshot | null> {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    if (!projectId || !apiKey) {
        return null;
    }

    const endpoint = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/bringShares/${encodeURIComponent(
        token
    )}?key=${apiKey}`;
    const response = await fetch(endpoint, { cache: "no-store" });
    if (response.status === 404) {
        return null;
    }
    if (!response.ok) {
        throw new Error("Kon Bring-share snapshot niet laden.");
    }

    const payload = (await response.json()) as FirestoreDocumentResponse;
    const fields = payload.fields ?? {};
    const expiresAt = getTimestamp(fields, "expiresAt");
    if (!expiresAt || expiresAt <= Date.now()) {
        return null;
    }

    return {
        token: getString(fields, "token") || token,
        householdId: getString(fields, "householdId"),
        createdBy: getString(fields, "createdBy"),
        createdAt: getTimestamp(fields, "createdAt"),
        expiresAt,
        title: getString(fields, "title") || "Bring snapshot",
        items: getItems(fields, "items"),
        servings: getNumber(fields, "servings") || 1,
        sourceWeekStart: getString(fields, "sourceWeekStart"),
    };
}

