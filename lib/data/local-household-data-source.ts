import { HouseholdDataSource } from "@/lib/data/types";
import { Household, InviteCode, Membership, UserRole } from "@/types";
import { createInviteCode } from "@/lib/utils/ids";

const HOUSEHOLD_KEY = "local.household";
const MEMBERSHIP_KEY = "local.membership";
const INVITE_KEY = "local.invite";
const MIGRATION_KEY_PREFIX = "migration:";

function readJson<T>(key: string): T | null {
    if (typeof window === "undefined") {
        return null;
    }

    const raw = window.localStorage.getItem(key);
    if (!raw) {
        return null;
    }

    try {
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

function writeJson(key: string, data: unknown) {
    if (typeof window === "undefined") {
        return;
    }
    window.localStorage.setItem(key, JSON.stringify(data));
}

export class LocalHouseholdDataSource implements HouseholdDataSource {
    async getMembership(userId: string): Promise<Membership | null> {
        const membership = readJson<Membership>(MEMBERSHIP_KEY);
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

        writeJson(HOUSEHOLD_KEY, household);
        writeJson(MEMBERSHIP_KEY, {
            uid: userId,
            householdId: household.id,
            role: "owner",
            joinedAt: now,
        } satisfies Membership);
        writeJson(INVITE_KEY, {
            code,
            householdId: household.id,
            createdBy: userId,
            active: true,
            createdAt: now,
        } satisfies InviteCode);

        return household;
    }

    async joinHousehold(userId: string, code: string): Promise<Membership> {
        const invite = readJson<InviteCode>(INVITE_KEY);
        if (!invite || !invite.active || invite.code !== code.trim().toUpperCase()) {
            throw new Error("Code niet gevonden.");
        }
        const membership: Membership = {
            uid: userId,
            householdId: invite.householdId,
            role: "member",
            joinedAt: Date.now(),
        };
        writeJson(MEMBERSHIP_KEY, membership);
        return membership;
    }

    async getHousehold(householdId: string): Promise<Household | null> {
        const household = readJson<Household>(HOUSEHOLD_KEY);
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
        writeJson(INVITE_KEY, nextInvite);
        writeJson(HOUSEHOLD_KEY, { ...household, activeInviteCode: code, updatedAt: now });
        return nextInvite;
    }

    async revokeInviteCode(household: Household): Promise<void> {
        const invite = readJson<InviteCode>(INVITE_KEY);
        if (invite) {
            writeJson(INVITE_KEY, { ...invite, active: false, revokedAt: Date.now() });
        }
        writeJson(HOUSEHOLD_KEY, { ...household, activeInviteCode: undefined, updatedAt: Date.now() });
    }

    async getInviteCode(code: string): Promise<InviteCode | null> {
        const invite = readJson<InviteCode>(INVITE_KEY);
        if (!invite || invite.code !== code.trim().toUpperCase()) {
            return null;
        }
        return invite;
    }

    async getMigrationState(householdId: string): Promise<{ done: boolean; importedAt?: number }> {
        const status = readJson<{ done: boolean; importedAt?: number }>(
            `${MIGRATION_KEY_PREFIX}${householdId}`
        );
        return status ?? { done: false };
    }

    async setMigrationDone(householdId: string): Promise<void> {
        writeJson(`${MIGRATION_KEY_PREFIX}${householdId}`, {
            done: true,
            importedAt: Date.now(),
        });
    }

    async ensureMembershipDocument(
        userId: string,
        householdId: string,
        role: UserRole
    ): Promise<void> {
        writeJson(MEMBERSHIP_KEY, {
            uid: userId,
            householdId,
            role,
            joinedAt: Date.now(),
        } satisfies Membership);
    }
}
