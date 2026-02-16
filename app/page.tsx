"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/context/StoreContext";

const PLANNING_THRESHOLD = 7;

export default function Home() {
  const router = useRouter();
  const { isReady, recipes } = useStore();

  useEffect(() => {
    if (!isReady) {
      return;
    }

    const nextRoute = recipes.length >= PLANNING_THRESHOLD ? "/planner" : "/recipes";
    router.replace(nextRoute);
  }, [isReady, recipes.length, router]);

  return (
    <div className="flex min-h-screen items-center justify-center p-6 text-sm text-gray-500">
      App laden...
    </div>
  );
}
