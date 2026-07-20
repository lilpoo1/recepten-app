"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useStore } from "@/context/StoreContext";
import { RecipeRevision } from "@/types";

const actionLabel: Record<RecipeRevision["action"], string> = {
    update: "Bewerking",
    delete: "Verwijdering",
    restore: "Herstel",
    mark_cooked: "Als gekookt gemarkeerd",
};

export default function RecipeHistoryPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const { loadRecipeRevisions, restoreRecipeVersion } = useStore();
    const [revisions, setRevisions] = useState<RecipeRevision[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        void loadRecipeRevisions(params.id)
            .then((items) => {
                if (active) {
                    setRevisions(items);
                }
            })
            .catch((loadError) => {
                if (active) {
                    setError(
                        loadError instanceof Error
                            ? loadError.message
                            : "Versiegeschiedenis laden is mislukt."
                    );
                }
            })
            .finally(() => {
                if (active) {
                    setLoading(false);
                }
            });
        return () => {
            active = false;
        };
    }, [loadRecipeRevisions, params.id]);

    const handleRestore = async (revision: RecipeRevision) => {
        if (!confirm(`Versie ${revision.version} van “${revision.snapshot.title}” herstellen?`)) {
            return;
        }
        setBusyId(revision.id);
        setError(null);
        try {
            await restoreRecipeVersion(params.id, revision.id);
            router.push(`/recipes/${params.id}`);
        } catch (restoreError) {
            setError(
                restoreError instanceof Error
                    ? restoreError.message
                    : "Versie herstellen is mislukt."
            );
        } finally {
            setBusyId(null);
        }
    };

    return (
        <main className="space-y-4 p-4 pb-24">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Versiegeschiedenis</h1>
                    <p className="mt-1 text-sm text-gray-500">Herstelpunten blijven 14 weken bewaard.</p>
                </div>
                <Link href="/recipes" className="text-sm font-semibold text-green-700">
                    Recepten
                </Link>
            </header>

            {error ? (
                <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
            ) : null}
            {loading ? <p className="text-sm text-gray-500">Geschiedenis laden...</p> : null}
            {!loading && revisions.length === 0 ? (
                <div className="rounded-lg border border-gray-100 bg-white p-8 text-center text-gray-500 shadow-sm">
                    Voor dit recept zijn nog geen eerdere versies.
                </div>
            ) : null}

            <div className="space-y-3">
                {revisions.map((revision) => (
                    <article
                        key={revision.id}
                        className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h2 className="font-semibold text-gray-900">
                                    Versie {revision.version}: {revision.snapshot.title}
                                </h2>
                                <p className="mt-1 text-xs text-gray-500">
                                    {actionLabel[revision.action]} ·{" "}
                                    {new Date(revision.createdAt).toLocaleString("nl-NL")}
                                </p>
                            </div>
                            <button
                                type="button"
                                disabled={busyId === revision.id}
                                onClick={() => void handleRestore(revision)}
                                className="rounded-full bg-green-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                            >
                                {busyId === revision.id ? "Bezig..." : "Herstel"}
                            </button>
                        </div>
                    </article>
                ))}
            </div>
        </main>
    );
}
