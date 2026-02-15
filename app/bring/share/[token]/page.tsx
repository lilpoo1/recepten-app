import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { BringShareItem, BringShareSnapshot } from "@/types";
import BringImportWidget from "@/components/BringImportWidget";

export const dynamic = "force-dynamic";

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
            return {
                name: mapFields.name?.stringValue ?? "",
                amount:
                    typeof mapFields.amount?.doubleValue === "number"
                        ? mapFields.amount.doubleValue
                        : Number(mapFields.amount?.integerValue ?? "0"),
                unit: mapFields.unit?.stringValue ?? "",
            };
        })
        .filter((item) => item.name.length > 0);
}

function formatAmount(amount: number): string {
    const rounded = Math.round((amount + Number.EPSILON) * 100) / 100;
    if (Number.isInteger(rounded)) {
        return rounded.toString();
    }
    return rounded.toString();
}

function formatIngredient(item: BringShareItem): string {
    const amount = formatAmount(item.amount);
    return `${amount} ${item.unit} ${item.name}`.trim();
}

async function fetchShareSnapshot(token: string): Promise<BringShareSnapshot | null> {
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

export default async function BringSharePage({
    params,
}: {
    params: Promise<{ token: string }>;
}) {
    const { token } = await params;
    const requestHeaders = await headers();
    const hostHeader = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
    const protocolHeader = requestHeaders.get("x-forwarded-proto") ?? "https";
    const host = hostHeader?.split(",")[0]?.trim();
    const protocol = protocolHeader.split(",")[0]?.trim() || "https";
    const shareUrl = host ? `${protocol}://${host}/bring/share/${encodeURIComponent(token)}` : "";
    const deeplinkFallbackUrl = shareUrl
        ? `https://api.getbring.com/rest/bringrecipes/deeplink?url=${encodeURIComponent(
            shareUrl
        )}&source=web&baseQuantity=1&requestedQuantity=1`
        : "";

    const snapshot = await fetchShareSnapshot(token);
    if (!snapshot) {
        return (
            <div className="mx-auto min-h-screen max-w-md bg-white p-6">
                <h1 className="text-2xl font-bold text-gray-900">Bring-link ongeldig</h1>
                <p className="mt-3 text-sm text-gray-600">
                    Deze link bestaat niet of is verlopen (24 uur geldig).
                </p>
                <Link href="/" className="mt-4 inline-block text-sm font-semibold text-green-700">
                    Terug naar ReceptenApp
                </Link>
            </div>
        );
    }

    if (snapshot.items.length === 0) {
        notFound();
    }

    const expiresAtLabel = new Date(snapshot.expiresAt).toLocaleString("nl-NL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
    const ingredientLines = snapshot.items.map(formatIngredient);
    const recipeJsonLd = {
        "@context": "https://schema.org",
        "@type": "Recipe",
        name: snapshot.title,
        author: {
            "@type": "Organization",
            name: "ReceptenApp",
        },
        recipeYield: `${snapshot.servings} lijst`,
        recipeIngredient: ingredientLines,
    };

    return (
        <div className="mx-auto min-h-screen max-w-md bg-white p-6">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(recipeJsonLd) }}
            />

            <h1 className="text-2xl font-bold text-gray-900">{snapshot.title}</h1>
            <p className="mt-2 text-sm text-gray-600">Verloopt: {expiresAtLabel}</p>

            <BringImportWidget
                sourceUrl=""
                baseQuantity={1}
                requestedQuantity={1}
                language="en"
            />

            {deeplinkFallbackUrl ? (
                <a
                    href={deeplinkFallbackUrl}
                    className="mt-3 block w-full rounded-lg border border-red-200 bg-white px-6 py-3 text-center text-sm font-semibold text-red-700"
                >
                    Open Bring deeplink (fallback)
                </a>
            ) : null}

            <div className="mt-6 rounded-lg bg-gray-50 p-4 text-left" itemScope itemType="http://schema.org/Recipe">
                <h2 className="font-semibold text-gray-900" itemProp="name">
                    {snapshot.title}
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                    Door <span itemProp="author">ReceptenApp</span>
                </p>
                <p className="mt-1 text-xs text-gray-500" itemProp="yield">
                    {snapshot.servings} lijst
                </p>
                <meta itemProp="recipeYield" content={`${snapshot.servings} lijst`} />
                <ul className="mt-3 list-inside list-disc text-sm text-gray-700">
                    {snapshot.items.map((item, index) => {
                        const ingredientLine = formatIngredient(item);
                        return (
                            <li key={`${item.name}-${index}`}>
                                <span itemProp="ingredients">{ingredientLine}</span>
                                <meta itemProp="recipeIngredient" content={ingredientLine} />
                            </li>
                        );
                    })}
                </ul>
            </div>

            <p className="mt-6 text-xs text-gray-500">
                Als Bring niet automatisch importeert, kopieer deze items handmatig in Bring.
            </p>
        </div>
    );
}
