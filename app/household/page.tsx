"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/context/StoreContext";

export default function HouseholdIndexPage() {
    const router = useRouter();
    const { household } = useStore();

    useEffect(() => {
        if (household) {
            router.replace("/household/manage");
            return;
        }
        router.replace("/household/create");
    }, [household, router]);

    return <div className="p-4 text-sm text-gray-500">Doorsturen...</div>;
}
