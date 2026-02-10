"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useStore } from "@/context/StoreContext";

export default function JoinHouseholdPage() {
    const router = useRouter();
    const { household, joinHousehold } = useStore();
    const [code, setCode] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await joinHousehold(code);
            router.push("/");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Joinen mislukt.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="p-4 pb-20">
            <h1 className="text-xl font-bold text-gray-900">Join huishouden</h1>
            <p className="mt-2 text-sm text-gray-600">
                Vul een gedeelde code in om aan een huishouden te koppelen.
            </p>

            {household ? (
                <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                    Je bent al gekoppeld aan <strong>{household.name}</strong>.
                    <Link href="/household/manage" className="mt-2 block font-semibold text-green-700">
                        Beheer huishouden
                    </Link>
                </div>
            ) : null}

            <form onSubmit={handleSubmit} className="mt-6 space-y-3">
                <label className="block">
                    <span className="mb-1 block text-sm font-medium text-gray-700">Code</span>
                    <input
                        type="text"
                        value={code}
                        onChange={(event) => setCode(event.target.value.toUpperCase())}
                        placeholder="ABC123"
                        className="w-full rounded-md border border-gray-300 p-2 uppercase tracking-widest"
                        required
                        minLength={4}
                    />
                </label>
                {error ? <p className="text-sm text-red-600">{error}</p> : null}
                <button
                    type="submit"
                    disabled={busy}
                    className="w-full rounded-md bg-green-600 px-4 py-2 font-medium text-white disabled:opacity-60"
                >
                    {busy ? "Bezig..." : "Join huishouden"}
                </button>
            </form>
        </div>
    );
}
