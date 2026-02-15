"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";

type BringLanguage = "de" | "en" | "fr" | "it";

interface BringImportWidgetProps {
    sourceUrl?: string;
    baseQuantity?: number;
    requestedQuantity?: number;
    language?: BringLanguage;
}

interface BringImportApi {
    render?: (targets?: Element[] | NodeListOf<Element>) => void;
}

interface BringWidgetsApi {
    import?: BringImportApi;
}

declare global {
    interface Window {
        bringwidgets?: BringWidgetsApi;
    }
}

function tryRenderWidget(target: HTMLDivElement | null): boolean {
    if (!target) {
        return false;
    }

    const render = window.bringwidgets?.import?.render;
    if (typeof render !== "function") {
        return false;
    }

    render([target]);
    return true;
}

export default function BringImportWidget({
    sourceUrl = "",
    baseQuantity = 1,
    requestedQuantity = 1,
    language = "en",
}: BringImportWidgetProps) {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        if (tryRenderWidget(containerRef.current)) {
            return;
        }

        let attempts = 0;
        const maxAttempts = 20;
        const timer = window.setInterval(() => {
            attempts += 1;
            const rendered = tryRenderWidget(containerRef.current);
            if (rendered || attempts >= maxAttempts) {
                window.clearInterval(timer);
            }
        }, 300);

        return () => window.clearInterval(timer);
    }, []);

    return (
        <>
            <Script
                src="//platform.getbring.com/widgets/import.js"
                strategy="afterInteractive"
                onLoad={() => {
                    tryRenderWidget(containerRef.current);
                }}
            />
            <div
                ref={containerRef}
                className="mt-4 flex justify-center"
                data-bring-import={sourceUrl}
                data-bring-base-quantity={String(baseQuantity)}
                data-bring-requested-quantity={String(requestedQuantity)}
                data-bring-language={language}
            >
                <a
                    href="https://www.getbring.com"
                    className="block w-full rounded-lg bg-red-600 px-6 py-3 text-center font-bold text-white shadow hover:bg-red-700"
                >
                    Importeer naar Bring
                </a>
            </div>
        </>
    );
}
