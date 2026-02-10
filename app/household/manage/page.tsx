"use client";

import Link from "next/link";
import { useState } from "react";
import { useStore } from "@/context/StoreContext";

export default function ManageHouseholdPage() {
    const { household, membership, inviteCode, refreshInviteCode, revokeInviteCode } = useStore();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const canManageCodes = membership?.role === "owner";

    const handleRefreshCode = async () => {
        setBusy(true);
        setError(null);
        try {
            await refreshInviteCode();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Code vernieuwen mislukt.");
        } finally {
            setBusy(false);
        }
    };

    const handleRevokeCode = async () => {
        setBusy(true);
        setError(null);
        try {
            await revokeInviteCode();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Code intrekken mislukt.");
        } finally {
            setBusy(false);
        }
    };

    if (!household) {
        return (
            <div className="p-4">
                <h1 className="text-xl font-bold text-gray-900">Huishouden beheer</h1>
                <p className="mt-2 text-sm text-gray-600">Nog geen huishouden gekoppeld.</p>
                <div className="mt-4 flex gap-2">
                    <Link href="/household/create" className="rounded-md bg-green-600 px-4 py-2 text-white">
                        Maak huishouden
                    </Link>
                    <Link href="/household/join" className="rounded-md border border-gray-300 px-4 py-2">
                        Join huishouden
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 pb-20">
            <h1 className="text-xl font-bold text-gray-900">Huishouden beheer</h1>
            <p className="mt-2 text-sm text-gray-600">
                Naam: <strong>{household.name}</strong>
            </p>
            <p className="mt-1 text-sm text-gray-600">
                Rol: <strong>{membership?.role === "owner" ? "Eigenaar" : "Lid"}</strong>
            </p>

            <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <p className="text-sm font-medium text-gray-700">Actieve join-code</p>
                <p className="mt-2 text-2xl font-bold tracking-wider text-gray-900">
                    {inviteCode?.active ? inviteCode.code : "Geen actieve code"}
                </p>
                <p className="mt-2 text-xs text-gray-500">
                    Alleen de eigenaar kan codes vernieuwen of intrekken.
                </p>

                {canManageCodes ? (
                    <div className="mt-4 grid gap-2">
                        <button
                            type="button"
                            onClick={handleRefreshCode}
                            disabled={busy}
                            className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                        >
                            {busy ? "Bezig..." : "Vernieuw code"}
                        </button>
                        <button
                            type="button"
                            onClick={handleRevokeCode}
                            disabled={busy}
                            className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-60"
                        >
                            Trek code in
                        </button>
                    </div>
                ) : null}

                {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
            </div>

            <Link href="/" className="mt-6 inline-block text-sm font-medium text-green-700">
                Terug naar app
            </Link>
        </div>
    );
}
