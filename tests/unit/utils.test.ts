import { afterEach, describe, expect, it, vi } from "vitest";
import { createId, createInviteCode } from "@/lib/utils/ids";
import { toMillis } from "@/lib/utils/time";

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe("generic utilities", () => {
    it("leest milliseconden uit nummers en Firestore timestamps", () => {
        expect(toMillis(123, 9)).toBe(123);
        expect(toMillis({ toMillis: () => 456 }, 9)).toBe(456);
        expect(toMillis("invalid", 9)).toBe(9);
    });

    it("gebruikt randomUUID voor nieuwe IDs wanneer beschikbaar", () => {
        vi.stubGlobal("crypto", { randomUUID: () => "uuid-1" });
        expect(createId()).toBe("uuid-1");
    });

    it("maakt invitecodes met het gevraagde veilige alfabet", () => {
        vi.spyOn(Math, "random").mockReturnValue(0);
        expect(createInviteCode(8)).toBe("AAAAAAAA");
        expect(createInviteCode(8)).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    });
});
