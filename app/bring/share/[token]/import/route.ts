import { NextResponse } from "next/server";
import {
    fetchBringShareSnapshot,
    toBringImportPayload,
} from "@/lib/bring/share-snapshot";

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Cache-Control": "no-store",
} as const;

export const dynamic = "force-dynamic";

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: CORS_HEADERS,
    });
}

export async function GET(
    _request: Request,
    context: { params: Promise<{ token: string }> }
) {
    const { token } = await context.params;

    try {
        const snapshot = await fetchBringShareSnapshot(token);
        if (!snapshot) {
            return NextResponse.json(
                { error: "Bring-link ongeldig of verlopen." },
                {
                    status: 404,
                    headers: CORS_HEADERS,
                }
            );
        }

        return NextResponse.json(toBringImportPayload(snapshot), {
            headers: CORS_HEADERS,
        });
    } catch (error) {
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Kon Bring import data niet laden.",
            },
            {
                status: 500,
                headers: CORS_HEADERS,
            }
        );
    }
}

