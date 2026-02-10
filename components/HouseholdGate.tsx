"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useState } from "react";
import { useStore } from "@/context/StoreContext";

function MigrationBanner() {
    const { migration, importLocalToHousehold, dismissMigration } = useStore();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!migration || migration.done || migration.dismissedAt) {
        return null;
    }

    const handleImport = async () => {
        setBusy(true);
        setError(null);
        try {
            await importLocalToHousehold();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Import mislukt.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="mx-4 mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-semibold">Lokale data gevonden</p>
            <p className="mt-1">
                {migration.sourceRecipeCount} recepten en {migration.sourceMealPlanCount} planning-items
                kunnen eenmalig worden geimporteerd naar dit huishouden.
            </p>
            {error ? <p className="mt-2 text-red-700">{error}</p> : null}
            <div className="mt-3 flex gap-2">
                <button
                    type="button"
                    onClick={handleImport}
                    disabled={busy}
                    className="rounded-md bg-green-600 px-3 py-1.5 font-medium text-white disabled:opacity-60"
                >
                    {busy ? "Bezig..." : "Importeer"}
                </button>
                <button
                    type="button"
                    onClick={dismissMigration}
                    disabled={busy}
                    className="rounded-md border border-amber-300 bg-white px-3 py-1.5 font-medium"
                >
                    Later
                </button>
            </div>
        </div>
    );
}

export default function HouseholdGate({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const { isReady, household, mode } = useStore();
    const isHouseholdRoute = pathname.startsWith("/household");

    if (!isReady) {
        return (
            <div className="p-8 text-center text-sm text-gray-500">
                Gegevens laden...
            </div>
        );
    }

    if (!household && !isHouseholdRoute) {
        return (
            <div className="mx-auto max-w-md p-6">
                <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                    <h1 className="text-xl font-bold text-gray-900">Koppel een huishouden</h1>
                    <p className="mt-2 text-sm text-gray-600">
                        Maak een huishouden of join met een code om recepten en planning te synchroniseren.
                    </p>
                    {mode === "local" ? (
                        <p className="mt-2 text-xs text-amber-700">
                            Firebase-config ontbreekt. De app draait nu lokaal.
                        </p>
                    ) : null}
                    <div className="mt-4 grid gap-2">
                        <Link
                            href="/household/create"
                            className="rounded-md bg-green-600 px-4 py-2 text-center font-medium text-white"
                        >
                            Huishouden maken
                        </Link>
                        <Link
                            href="/household/join"
                            className="rounded-md border border-gray-300 px-4 py-2 text-center font-medium text-gray-700"
                        >
                            Join met code
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <>
            {!isHouseholdRoute ? <MigrationBanner /> : null}
            {children}
        </>
    );
}
