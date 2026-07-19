import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { BringShareItem } from "@/types";
import BringImportWidget from "@/components/BringImportWidget";
import {
    fetchBringShareSnapshot,
    toBringImportItem,
} from "@/lib/bring/share-snapshot";

export const dynamic = "force-dynamic";

function formatIngredient(item: BringShareItem): string {
    const quantityText = (item.quantityText ?? "").trim();
    return quantityText ? `${item.name}, ${quantityText}` : item.name;
}

export default async function BringSharePage({
    params,
    searchParams,
}: {
    params: Promise<{ token: string }>;
    searchParams?: Promise<{ debug?: string | string[] }>;
}) {
    const { token } = await params;
    const resolvedSearchParams = searchParams ? await searchParams : undefined;
    const debugValue = resolvedSearchParams?.debug;
    const debugEnabled = Array.isArray(debugValue)
        ? debugValue.includes("1")
        : debugValue === "1";
    const requestHeaders = await headers();
    const hostHeader = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
    const protocolHeader = requestHeaders.get("x-forwarded-proto") ?? "https";
    const host = hostHeader?.split(",")[0]?.trim();
    const protocol = protocolHeader.split(",")[0]?.trim() || "https";
    const shareUrl = host ? `${protocol}://${host}/bring/share/${encodeURIComponent(token)}` : "";
    const jsonImportUrl = host
        ? `${protocol}://${host}/bring/share/${encodeURIComponent(token)}/import`
        : "";
    const deeplinkFallbackUrl = shareUrl
        ? `https://api.getbring.com/rest/bringrecipes/deeplink?url=${encodeURIComponent(
            shareUrl
        )}&source=web&baseQuantity=1&requestedQuantity=1`
        : "";
    const jsonDeeplinkUrl = jsonImportUrl
        ? `https://api.getbring.com/rest/bringrecipes/deeplink?url=${encodeURIComponent(
            jsonImportUrl
        )}&source=web&baseQuantity=1&requestedQuantity=1`
        : "";

    const snapshot = await fetchBringShareSnapshot(token);
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
            {jsonDeeplinkUrl ? (
                <a
                    href={jsonDeeplinkUrl}
                    className="mt-3 block w-full rounded-lg border border-blue-200 bg-white px-6 py-3 text-center text-sm font-semibold text-blue-700"
                >
                    Open Bring JSON import (test)
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
            {debugEnabled ? (
                <div className="mt-4 rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-700">
                    <p className="mb-2 font-semibold">Debug JSON mapping preview</p>
                    <pre className="overflow-x-auto whitespace-pre-wrap">
                        {JSON.stringify(snapshot.items.slice(0, 10).map((item) => toBringImportItem(item)), null, 2)}
                    </pre>
                </div>
            ) : null}

            <p className="mt-6 text-xs text-gray-500">
                Als Bring niet automatisch importeert, kopieer deze items handmatig in Bring.
            </p>
        </div>
    );
}
