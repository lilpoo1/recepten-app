"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useStore } from "@/context/StoreContext";

export default function CreateHouseholdPage() {
    const router = useRouter();
    const { household, createHousehold } = useStore();
    const [name, setName] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await createHousehold(name);
            router.push("/household/manage");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Huishouden maken mislukt.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="p-4 pb-20">
            <h1 className="text-xl font-bold text-gray-900">Huishouden maken</h1>
            <p className="mt-2 text-sm text-gray-600">
                Maak een huishouden en deel daarna de join-code.
            </p>

            {household ? (
                <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                    Je bent al gekoppeld aan <strong>{household.name}</strong>.
                    <Link href="/household/manage" className="mt-2 block font-semibold text-green-700">
                        Ga naar beheer
                    </Link>
                </div>
            ) : null}

            <form onSubmit={handleSubmit} className="mt-6 space-y-3">
                <label className="block">
                    <span className="mb-1 block text-sm font-medium text-gray-700">Naam huishouden</span>
                    <input
                        type="text"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="Bijv. Familie Janssen"
                        className="w-full rounded-md border border-gray-300 p-2"
                        required
                        minLength={2}
                    />
                </label>
                {error ? <p className="text-sm text-red-600">{error}</p> : null}
                <button
                    type="submit"
                    disabled={busy}
                    className="w-full rounded-md bg-green-600 px-4 py-2 font-medium text-white disabled:opacity-60"
                >
                    {busy ? "Bezig..." : "Maak huishouden"}
                </button>
            </form>
        </div>
    );
}
