import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import BringImportWidget from "@/components/BringImportWidget";
import { fetchBringShareSnapshot } from "@/lib/bring/share-snapshot";
import { buildBringDeeplink, toBringRecipeJsonLd } from "@/lib/bring/import";

export const dynamic = "force-dynamic";

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
    const deeplinkFallbackUrl = shareUrl ? buildBringDeeplink(shareUrl) : "";

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

    const recipeJsonLd = toBringRecipeJsonLd(snapshot);
    if (recipeJsonLd.recipeIngredient.length === 0) {
        notFound();
    }

    const expiresAtLabel = new Date(snapshot.expiresAt).toLocaleString("nl-NL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
    const serializedRecipeJsonLd = JSON.stringify(recipeJsonLd).replace(/</g, "\\u003c");

    return (
        <div className="mx-auto min-h-screen max-w-md bg-white p-6">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: serializedRecipeJsonLd }}
            />

            <h1 className="text-2xl font-bold text-gray-900">{recipeJsonLd.name}</h1>
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
                    {recipeJsonLd.name}
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                    Door <span itemProp="author">ReceptenApp</span>
                </p>
                <p className="mt-1 text-xs text-gray-500" itemProp="recipeYield">
                    {recipeJsonLd.recipeYield}
                </p>
                <ul className="mt-3 list-inside list-disc text-sm text-gray-700">
                    {recipeJsonLd.recipeIngredient.map((ingredientLine, index) => (
                        <li key={`${ingredientLine}-${index}`} itemProp="recipeIngredient">
                            {ingredientLine}
                        </li>
                    ))}
                </ul>
            </div>

            <p className="mt-6 text-xs text-gray-500">
                Als Bring niet automatisch importeert, kopieer deze items handmatig in Bring.
            </p>
        </div>
    );
}
