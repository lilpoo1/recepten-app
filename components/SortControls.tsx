"use client";

import { SortOption } from "@/types";

interface SortModalProps {
    currentSort: SortOption;
    onSortChange: (sort: SortOption) => void;
}

export default function SortControls({ currentSort, onSortChange }: SortModalProps) {
    return (
        <div className="flex gap-2 text-sm overflow-x-auto pb-2">
            <button
                onClick={() => onSortChange("name")}
                className={`px-3 py-1 rounded-full border whitespace-nowrap ${currentSort === "name" ? "bg-green-100 border-green-200 text-green-700" : "bg-white border-gray-200 text-gray-600"}`}
            >
                A-Z
            </button>
            <button
                onClick={() => onSortChange("created")}
                className={`px-3 py-1 rounded-full border whitespace-nowrap ${currentSort === "created" ? "bg-green-100 border-green-200 text-green-700" : "bg-white border-gray-200 text-gray-600"}`}
            >
                Nieuwste
            </button>
            <button
                onClick={() => onSortChange("last_eaten")}
                className={`px-3 py-1 rounded-full border whitespace-nowrap ${currentSort === "last_eaten" ? "bg-green-100 border-green-200 text-green-700" : "bg-white border-gray-200 text-gray-600"}`}
            >
                Langst geleden gegeten
            </button>
            <button
                onClick={() => onSortChange("time")}
                className={`px-3 py-1 rounded-full border whitespace-nowrap ${currentSort === "time" ? "bg-green-100 border-green-200 text-green-700" : "bg-white border-gray-200 text-gray-600"}`}
            >
                Snelste
            </button>
        </div>
    );
}
