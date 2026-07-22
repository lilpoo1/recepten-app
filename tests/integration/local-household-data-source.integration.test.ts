import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocalHouseholdDataSource } from "@/lib/data/local-household-data-source";
import { resetBrowserTestState } from "@/tests/helpers/browser-test-state";

let source: LocalHouseholdDataSource;

beforeEach(async () => {
    vi.useRealTimers();
    await resetBrowserTestState();
    source = new LocalHouseholdDataSource();
});

describe("LocalHouseholdDataSource with IndexedDB", () => {
    it("maakt een huishouden, eigenaarmembership en actieve invite", async () => {
        const household = await source.createHousehold("owner-1", "Thuis");
        expect(household).toMatchObject({ id: "local-household", name: "Thuis", ownerUid: "owner-1" });
        await expect(source.getMembership("owner-1")).resolves.toMatchObject({
            householdId: household.id,
            role: "owner",
        });
        await expect(source.getInviteCode(household.activeInviteCode ?? "")).resolves.toMatchObject({
            householdId: household.id,
            active: true,
        });
    });

    it("joint hoofdletterongevoelig en weigert een ongeldige code", async () => {
        const household = await source.createHousehold("owner-1", "Thuis");
        const code = household.activeInviteCode ?? "";
        await expect(source.joinHousehold("member-1", code.toLowerCase())).resolves.toMatchObject({
            uid: "member-1",
            role: "member",
        });
        await expect(source.joinHousehold("attacker", "WRONG1")).rejects.toThrow("Code niet gevonden");
    });

    it("vernieuwt en herroept invites en bewaart migratiestatus", async () => {
        const household = await source.createHousehold("owner-1", "Thuis");
        const refreshed = await source.refreshInviteCode(household, "owner-1");
        expect(refreshed.active).toBe(true);
        await source.revokeInviteCode({ ...household, activeInviteCode: refreshed.code });
        await expect(source.getInviteCode(refreshed.code)).resolves.toMatchObject({ active: false });

        await expect(source.getMigrationState(household.id)).resolves.toEqual({ done: false });
        await source.setMigrationDone(household.id);
        await expect(source.getMigrationState(household.id)).resolves.toMatchObject({ done: true });
    });
});
