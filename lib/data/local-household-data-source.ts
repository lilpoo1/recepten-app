import { HouseholdDataSource } from "@/lib/data/types";
import { Household, InviteCode, Membership, UserRole } from "@/types";
import { createInviteCode } from "@/lib/utils/ids";
import { readLocalValue, writeLocalValue } from "@/lib/storage/browser-storage";

const HOUSEHOLD_KEY = "local.household";
const MEMBERSHIP_KEY = "local.membership";
const INVITE_KEY = "local.invite";
const MIGRATION_KEY_PREFIX = "migration:";

async function readJson<T>(key: string): Promise<T | null> {
    return readLocalValue<T>(key);
}

async function writeJson(key: string, data: unknown) {
    await writeLocalValue(key, data);
}

export class LocalHouseholdDataSource implements HouseholdDataSource {
    async getMembership(userId: string): Promise<Membership | null> {
        const membership = await readJson<Membership>(MEMBERSHIP_KEY);
        if (!membership) {
            return null;
        }
        return { ...membership, uid: userId };
    }

    async createHousehold(userId: string, name: string): Promise<Household> {
        const now = Date.now();
        const code = createInviteCode(6);
        const household: Household = {
            id: "local-household",
            name,
            ownerUid: userId,
            activeInviteCode: code,
            createdAt: now,
            updatedAt: now,
        };

        await writeJson(HOUSEHOLD_KEY, household);
        await writeJson(MEMBERSHIP_KEY, {
            uid: userId,
            householdId: household.id,
            role: "owner",
            joinedAt: now,
        } satisfies Membership);
        await writeJson(INVITE_KEY, {
            code,
            householdId: household.id,
            createdBy: userId,
            active: true,
            createdAt: now,
        } satisfies InviteCode);

        return household;
    }

    async joinHousehold(userId: string, code: string): Promise<Membership> {
        const invite = await readJson<InviteCode>(INVITE_KEY);
        if (!invite || !invite.active || invite.code !== code.trim().toUpperCase()) {
            throw new Error("Code niet gevonden.");
        }
        const membership: Membership = {
            uid: userId,
            householdId: invite.householdId,
            role: "member",
            joinedAt: Date.now(),
        };
        await writeJson(MEMBERSHIP_KEY, membership);
        return membership;
    }

    async getHousehold(householdId: string): Promise<Household | null> {
        const household = await readJson<Household>(HOUSEHOLD_KEY);
        if (!household || household.id !== householdId) {
            return null;
        }
        return household;
    }

    async refreshInviteCode(household: Household, userId: string): Promise<InviteCode> {
        const code = createInviteCode(6);
        const now = Date.now();
        const nextInvite: InviteCode = {
            code,
            householdId: household.id,
            createdBy: userId,
            active: true,
            createdAt: now,
        };
        await writeJson(INVITE_KEY, nextInvite);
        await writeJson(HOUSEHOLD_KEY, { ...household, activeInviteCode: code, updatedAt: now });
        return nextInvite;
    }

    async revokeInviteCode(household: Household): Promise<void> {
        const invite = await readJson<InviteCode>(INVITE_KEY);
        if (invite) {
            await writeJson(INVITE_KEY, { ...invite, active: false, revokedAt: Date.now() });
        }
        await writeJson(HOUSEHOLD_KEY, { ...household, activeInviteCode: undefined, updatedAt: Date.now() });
    }

    async getInviteCode(code: string): Promise<InviteCode | null> {
        const invite = await readJson<InviteCode>(INVITE_KEY);
        if (!invite || invite.code !== code.trim().toUpperCase()) {
            return null;
        }
        return invite;
    }

    async getMigrationState(householdId: string): Promise<{ done: boolean; importedAt?: number }> {
        const status = await readJson<{ done: boolean; importedAt?: number }>(
            `${MIGRATION_KEY_PREFIX}${householdId}`
        );
        return status ?? { done: false };
    }

    async setMigrationDone(householdId: string): Promise<void> {
        await writeJson(`${MIGRATION_KEY_PREFIX}${householdId}`, {
            done: true,
            importedAt: Date.now(),
        });
    }

    async ensureMembershipDocument(
        userId: string,
        householdId: string,
        role: UserRole
    ): Promise<void> {
        await writeJson(MEMBERSHIP_KEY, {
            uid: userId,
            householdId,
            role,
            joinedAt: Date.now(),
        } satisfies Membership);
    }
}
