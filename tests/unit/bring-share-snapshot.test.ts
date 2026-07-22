import { afterEach, describe, expect, it, vi } from "vitest";
import {
    fetchBringShareSnapshot,
    toBringImportItem,
    toBringImportPayload,
} from "@/lib/bring/share-snapshot";
import type { BringShareSnapshot } from "@/types";

afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
});

describe("Bring share snapshots", () => {
    it("maakt het afgesproken importer-payload", () => {
        const snapshot = { items: [{ name: " Tomaat ", quantityText: " 2 stuks " }] } as BringShareSnapshot;
        expect(toBringImportItem(snapshot.items[0])).toEqual({ itemId: "Tomaat", spec: "2 stuks" });
        expect(toBringImportPayload(snapshot)).toEqual({
            schema: "bring.importer/v1",
            items: [{ itemId: "Tomaat", spec: "2 stuks" }],
        });
    });

    it("stopt zonder Firebase-configuratie", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        await expect(fetchBringShareSnapshot("token")).resolves.toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("geeft null terug voor ontbrekende of verlopen snapshots", async () => {
        vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "project");
        vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "key");
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({ status: 404, ok: false })
            .mockResolvedValueOnce({
                status: 200,
                ok: true,
                json: async () => ({ fields: { expiresAt: { timestampValue: "2020-01-01T00:00:00Z" } } }),
            });
        vi.stubGlobal("fetch", fetchMock);
        await expect(fetchBringShareSnapshot("missing")).resolves.toBeNull();
        await expect(fetchBringShareSnapshot("expired")).resolves.toBeNull();
    });

    it("vertaalt een geldig Firestore REST-document inclusief legacy hoeveelheid", async () => {
        vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "project");
        vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "key");
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
            status: 200,
            ok: true,
            json: async () => ({
                fields: {
                    householdId: { stringValue: "household-1" },
                    createdBy: { stringValue: "user-1" },
                    createdAt: { timestampValue: "2026-07-22T10:00:00Z" },
                    expiresAt: { timestampValue: "2099-07-23T10:00:00Z" },
                    title: { stringValue: "Weeklijst" },
                    servings: { integerValue: "4" },
                    sourceWeekStart: { stringValue: "2026-07-20" },
                    items: { arrayValue: { values: [
                        { mapValue: { fields: { name: { stringValue: "Melk" }, amount: { doubleValue: 1.5 }, unit: { stringValue: "l" } } } },
                        { mapValue: { fields: { name: { stringValue: " " } } } },
                    ] } },
                },
            }),
        }));

        await expect(fetchBringShareSnapshot("share token")).resolves.toMatchObject({
            token: "share token",
            householdId: "household-1",
            title: "Weeklijst",
            servings: 4,
            items: [{ name: "Melk", quantityText: "1.5 l" }],
        });
        expect(fetch).toHaveBeenCalledWith(expect.stringContaining("share%20token"), { cache: "no-store" });
    });

    it("meldt een foutieve Firestore-response", async () => {
        vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "project");
        vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "key");
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 500, ok: false }));
        await expect(fetchBringShareSnapshot("token")).rejects.toThrow("Kon Bring-share snapshot niet laden");
    });
});
