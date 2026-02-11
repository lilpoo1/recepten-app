import {
    arrayUnion,
    collection,
    doc,
    DocumentData,
    getDoc,
    getDocs,
    increment,
    onSnapshot,
    query,
    serverTimestamp,
    setDoc,
    Timestamp,
    updateDoc,
    where,
    writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { DataSource, HouseholdDataSource, HouseholdSnapshot, Unsubscribe } from "@/lib/data/types";
import {
    BringShareSnapshotInput,
    BringShareSnapshotResult,
    Household,
    InviteCode,
    MealPlanDraft,
    MealPlanEntry,
    Membership,
    Recipe,
    RecipeDraft,
    UserRole,
} from "@/types";
import { createId, createInviteCode } from "@/lib/utils/ids";
import { normalizeMealPlanEntry, normalizeRecipe } from "@/lib/data/normalize";
import { toMillis } from "@/lib/utils/time";

function ensureDb() {
    if (!db) {
        throw new Error("Firebase is not configured.");
    }
    return db;
}

function omitUndefinedFields<T extends Record<string, unknown>>(input: T): DocumentData {
    const output: DocumentData = {};
    Object.entries(input).forEach(([key, value]) => {
        if (value !== undefined) {
            output[key] = value;
        }
    });
    return output;
}

function mapHousehold(id: string, data: DocumentData): Household {
    return {
        id,
        name: typeof data.name === "string" ? data.name : "Huishouden",
        ownerUid: typeof data.ownerUid === "string" ? data.ownerUid : "",
        activeInviteCode:
            typeof data.activeInviteCode === "string" ? data.activeInviteCode : undefined,
        createdAt: toMillis(data.createdAt),
        updatedAt: toMillis(data.updatedAt),
    };
}

function mapMembership(uid: string, data: DocumentData): Membership {
    return {
        uid,
        householdId: typeof data.householdId === "string" ? data.householdId : "",
        role: data.role === "owner" ? "owner" : "member",
        joinedAt: toMillis(data.joinedAt),
    };
}

function mapInvite(code: string, data: DocumentData): InviteCode {
    return {
        code,
        householdId: typeof data.householdId === "string" ? data.householdId : "",
        createdBy: typeof data.createdBy === "string" ? data.createdBy : "",
        active: data.active !== false,
        createdAt: toMillis(data.createdAt),
        expiresAt: toMillis(data.expiresAt, 0) || undefined,
        revokedAt: toMillis(data.revokedAt, 0) || undefined,
    };
}

async function createUniqueInvite(): Promise<string> {
    const dbRef = ensureDb();
    for (let attempt = 0; attempt < 8; attempt += 1) {
        const code = createInviteCode(6);
        const ref = doc(dbRef, "householdInvites", code);
        const existing = await getDoc(ref);
        if (!existing.exists()) {
            return code;
        }
    }
    throw new Error("Kon geen unieke code maken. Probeer opnieuw.");
}

export class FirebaseDataSource implements DataSource {
    readonly mode = "firebase" as const;

    async loadHouseholdData(householdId: string): Promise<HouseholdSnapshot> {
        const dbRef = ensureDb();
        const recipesSnapshot = await getDocs(collection(dbRef, "households", householdId, "recipes"));
        const mealPlanSnapshot = await getDocs(collection(dbRef, "households", householdId, "mealPlan"));

        const recipes = recipesSnapshot.docs.map((item) =>
            normalizeRecipe({ id: item.id, ...item.data() }, householdId, "unknown-user")
        );
        const mealPlan = mealPlanSnapshot.docs.map((item) =>
            normalizeMealPlanEntry({ id: item.id, ...item.data() }, householdId, "unknown-user")
        );

        return { recipes, mealPlan };
    }

    watchHouseholdData(
        householdId: string,
        onChange: (snapshot: HouseholdSnapshot) => void
    ): Unsubscribe {
        const dbRef = ensureDb();
        let recipes: Recipe[] = [];
        let mealPlan: MealPlanEntry[] = [];

        const push = () => {
            onChange({ recipes, mealPlan });
        };

        const recipesUnsubscribe = onSnapshot(
            collection(dbRef, "households", householdId, "recipes"),
            (snapshot) => {
                recipes = snapshot.docs.map((item) =>
                    normalizeRecipe({ id: item.id, ...item.data() }, householdId, "unknown-user")
                );
                push();
            }
        );

        const mealPlanUnsubscribe = onSnapshot(
            collection(dbRef, "households", householdId, "mealPlan"),
            (snapshot) => {
                mealPlan = snapshot.docs.map((item) =>
                    normalizeMealPlanEntry({ id: item.id, ...item.data() }, householdId, "unknown-user")
                );
                push();
            }
        );

        return () => {
            recipesUnsubscribe();
            mealPlanUnsubscribe();
        };
    }

    async addRecipe(householdId: string, userId: string, draft: RecipeDraft): Promise<string> {
        const dbRef = ensureDb();
        const id = createId();
        await setDoc(
            doc(dbRef, "households", householdId, "recipes", id),
            omitUndefinedFields({
                ...draft,
                householdId,
                createdBy: userId,
                cookingHistory: [],
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                version: 1,
            })
        );
        return id;
    }

    async updateRecipe(householdId: string, _userId: string, recipe: Recipe): Promise<void> {
        const dbRef = ensureDb();
        const ref = doc(dbRef, "households", householdId, "recipes", recipe.id);
        await setDoc(
            ref,
            omitUndefinedFields({
                ...recipe,
                updatedAt: serverTimestamp(),
                version: increment(1),
            }),
            { merge: true }
        );
    }

    async deleteRecipe(householdId: string, recipeId: string): Promise<void> {
        const dbRef = ensureDb();
        const batch = writeBatch(dbRef);
        const recipeRef = doc(dbRef, "households", householdId, "recipes", recipeId);
        batch.delete(recipeRef);

        const mealPlanRef = collection(dbRef, "households", householdId, "mealPlan");
        const recipeEntries = await getDocs(query(mealPlanRef, where("recipeId", "==", recipeId)));
        recipeEntries.forEach((entry) => {
            batch.delete(entry.ref);
        });

        await batch.commit();
    }

    async markAsCooked(householdId: string, recipeId: string): Promise<void> {
        const dbRef = ensureDb();
        await updateDoc(doc(dbRef, "households", householdId, "recipes", recipeId), {
            cookingHistory: arrayUnion(Date.now()),
            updatedAt: serverTimestamp(),
            version: increment(1),
        });
    }

    async upsertMealPlanEntry(
        householdId: string,
        userId: string,
        draft: MealPlanDraft
    ): Promise<void> {
        const dbRef = ensureDb();
        const mealPlanRef = collection(dbRef, "households", householdId, "mealPlan");
        const existing = await getDocs(
            query(mealPlanRef, where("date", "==", draft.date), where("mealType", "==", draft.mealType))
        );

        const batch = writeBatch(dbRef);
        existing.forEach((entry) => batch.delete(entry.ref));

        const nextRef = doc(dbRef, "households", householdId, "mealPlan", createId());
        batch.set(nextRef, {
            householdId,
            createdBy: userId,
            recipeId: draft.recipeId,
            date: draft.date,
            servings: draft.servings,
            mealType: draft.mealType,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            version: 1,
        });

        await batch.commit();
    }

    async removeMealPlanEntry(
        householdId: string,
        date: string,
        recipeId: string,
        mealType: MealPlanEntry["mealType"]
    ): Promise<void> {
        const dbRef = ensureDb();
        const mealPlanRef = collection(dbRef, "households", householdId, "mealPlan");
        const entries = await getDocs(
            query(
                mealPlanRef,
                where("date", "==", date),
                where("recipeId", "==", recipeId),
                where("mealType", "==", mealType)
            )
        );

        const batch = writeBatch(dbRef);
        entries.forEach((entry) => batch.delete(entry.ref));
        await batch.commit();
    }

    async createBringShareSnapshot(
        householdId: string,
        userId: string,
        input: BringShareSnapshotInput,
        baseUrl: string
    ): Promise<BringShareSnapshotResult> {
        const dbRef = ensureDb();
        const token = createId().replace(/-/g, "");
        const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
        await setDoc(doc(dbRef, "bringShares", token), {
            token,
            householdId,
            createdBy: userId,
            title: input.title,
            items: input.items,
            servings: input.servings,
            sourceWeekStart: input.sourceWeekStart,
            createdAt: serverTimestamp(),
            expiresAt: Timestamp.fromMillis(expiresAt),
        });

        return {
            token,
            url: `${baseUrl.replace(/\/$/, "")}/bring/share/${token}`,
            expiresAt,
            title: input.title,
        };
    }
}

export class FirebaseHouseholdDataSource implements HouseholdDataSource {
    async getMembership(userId: string): Promise<Membership | null> {
        const dbRef = ensureDb();
        const snapshot = await getDoc(doc(dbRef, "userMemberships", userId));
        if (!snapshot.exists()) {
            return null;
        }
        return mapMembership(userId, snapshot.data() ?? {});
    }

    async createHousehold(userId: string, name: string): Promise<Household> {
        const dbRef = ensureDb();
        const householdId = createId();
        const code = await createUniqueInvite();
        const batch = writeBatch(dbRef);

        batch.set(doc(dbRef, "households", householdId), {
            name,
            ownerUid: userId,
            activeInviteCode: code,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
        batch.set(doc(dbRef, "userMemberships", userId), {
            householdId,
            role: "owner",
            joinedAt: serverTimestamp(),
        });
        batch.set(doc(dbRef, "households", householdId, "members", userId), {
            role: "owner",
            joinedAt: serverTimestamp(),
        });
        batch.set(doc(dbRef, "householdInvites", code), {
            householdId,
            createdBy: userId,
            active: true,
            createdAt: serverTimestamp(),
        });

        await batch.commit();

        const created = await getDoc(doc(dbRef, "households", householdId));
        return mapHousehold(householdId, created.data() ?? { name, ownerUid: userId, activeInviteCode: code });
    }

    async joinHousehold(userId: string, code: string): Promise<Membership> {
        const dbRef = ensureDb();
        const normalizedCode = code.trim().toUpperCase();
        const inviteRef = doc(dbRef, "householdInvites", normalizedCode);
        const inviteSnap = await getDoc(inviteRef);
        if (!inviteSnap.exists()) {
            throw new Error("Code niet gevonden.");
        }

        const invite = mapInvite(normalizedCode, inviteSnap.data() ?? {});
        if (!invite.active) {
            throw new Error("Deze code is ingetrokken.");
        }
        if (invite.expiresAt && invite.expiresAt < Date.now()) {
            throw new Error("Deze code is verlopen.");
        }

        await this.ensureMembershipDocument(userId, invite.householdId, "member");
        const membership = await this.getMembership(userId);

        if (!membership) {
            throw new Error("Lidmaatschap kon niet worden opgeslagen.");
        }

        return membership;
    }

    async getHousehold(householdId: string): Promise<Household | null> {
        const dbRef = ensureDb();
        const snapshot = await getDoc(doc(dbRef, "households", householdId));
        if (!snapshot.exists()) {
            return null;
        }
        return mapHousehold(snapshot.id, snapshot.data() ?? {});
    }

    async refreshInviteCode(household: Household, userId: string): Promise<InviteCode> {
        const dbRef = ensureDb();
        const nextCode = await createUniqueInvite();
        const batch = writeBatch(dbRef);

        if (household.activeInviteCode) {
            batch.set(
                doc(dbRef, "householdInvites", household.activeInviteCode),
                { active: false, revokedAt: serverTimestamp() },
                { merge: true }
            );
        }

        batch.set(doc(dbRef, "householdInvites", nextCode), {
            householdId: household.id,
            createdBy: userId,
            active: true,
            createdAt: serverTimestamp(),
        });
        batch.set(
            doc(dbRef, "households", household.id),
            {
                activeInviteCode: nextCode,
                updatedAt: serverTimestamp(),
            },
            { merge: true }
        );

        await batch.commit();

        const invite = await getDoc(doc(dbRef, "householdInvites", nextCode));
        return mapInvite(nextCode, invite.data() ?? { householdId: household.id, createdBy: userId, active: true });
    }

    async revokeInviteCode(household: Household): Promise<void> {
        if (!household.activeInviteCode) {
            return;
        }

        const dbRef = ensureDb();
        const batch = writeBatch(dbRef);
        batch.set(
            doc(dbRef, "householdInvites", household.activeInviteCode),
            { active: false, revokedAt: serverTimestamp() },
            { merge: true }
        );
        batch.set(
            doc(dbRef, "households", household.id),
            {
                activeInviteCode: null,
                updatedAt: serverTimestamp(),
            },
            { merge: true }
        );
        await batch.commit();
    }

    async getInviteCode(code: string): Promise<InviteCode | null> {
        const dbRef = ensureDb();
        const normalizedCode = code.trim().toUpperCase();
        const snapshot = await getDoc(doc(dbRef, "householdInvites", normalizedCode));
        if (!snapshot.exists()) {
            return null;
        }
        return mapInvite(snapshot.id, snapshot.data() ?? {});
    }

    async getMigrationState(householdId: string): Promise<{ done: boolean; importedAt?: number }> {
        const dbRef = ensureDb();
        const snapshot = await getDoc(doc(dbRef, "households", householdId, "meta", "migration"));
        if (!snapshot.exists()) {
            return { done: false };
        }

        const data = snapshot.data() ?? {};
        return {
            done: Boolean(data.done),
            importedAt: toMillis(data.importedAt, 0) || undefined,
        };
    }

    async setMigrationDone(householdId: string): Promise<void> {
        const dbRef = ensureDb();
        await setDoc(
            doc(dbRef, "households", householdId, "meta", "migration"),
            {
                done: true,
                importedAt: serverTimestamp(),
            },
            { merge: true }
        );
    }

    async ensureMembershipDocument(
        userId: string,
        householdId: string,
        role: UserRole
    ): Promise<void> {
        const dbRef = ensureDb();
        const batch = writeBatch(dbRef);
        batch.set(
            doc(dbRef, "userMemberships", userId),
            {
                householdId,
                role,
                joinedAt: serverTimestamp(),
            },
            { merge: true }
        );
        batch.set(
            doc(dbRef, "households", householdId, "members", userId),
            {
                role,
                joinedAt: serverTimestamp(),
            },
            { merge: true }
        );
        await batch.commit();
    }
}
