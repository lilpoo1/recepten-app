import {
    arrayUnion,
    collection,
    deleteField,
    doc,
    DocumentData,
    getDoc,
    getDocs,
    onSnapshot,
    query,
    runTransaction,
    serverTimestamp,
    setDoc,
    Timestamp,
    where,
    writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { DataSource, HouseholdDataSource, HouseholdSnapshot, Unsubscribe } from "@/lib/data/types";
import {
    BringShareSnapshotInput,
    BringShareSnapshotResult,
    BackupStatus,
    Household,
    InviteCode,
    MealPlanDraft,
    MealPlanEntry,
    Membership,
    Recipe,
    RecipeDraft,
    RecipeRevision,
    RecipeRevisionAction,
    UserRole,
} from "@/types";
import { createId, createInviteCode } from "@/lib/utils/ids";
import { normalizeMealPlanEntry, normalizeRecipe } from "@/lib/data/normalize";
import { toMillis } from "@/lib/utils/time";

const REVISION_RETENTION_MS = 98 * 24 * 60 * 60 * 1000;

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

function recipeDocumentFields(recipe: Recipe): DocumentData {
    return omitUndefinedFields({
        householdId: recipe.householdId,
        createdBy: recipe.createdBy,
        title: recipe.title,
        description: recipe.description,
        image: recipe.image,
        ingredients: recipe.ingredients,
        baseServings: recipe.baseServings,
        steps: recipe.steps,
        prepTimeMinutes: recipe.prepTimeMinutes,
        difficulty: recipe.difficulty,
        tags: recipe.tags,
        notes: recipe.notes,
        cookingHistory: recipe.cookingHistory,
    });
}

function revisionDocument(
    householdId: string,
    recipeId: string,
    userId: string,
    action: RecipeRevisionAction,
    snapshot: DocumentData,
    version: number
): DocumentData {
    return {
        householdId,
        recipeId,
        version,
        action,
        snapshot,
        createdBy: userId,
        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + REVISION_RETENTION_MS),
    };
}

function mapRecipeRevision(
    id: string,
    data: DocumentData,
    householdId: string,
    recipeId: string
): RecipeRevision {
    return {
        id,
        householdId,
        recipeId,
        version: typeof data.version === "number" ? data.version : 1,
        action:
            data.action === "delete" ||
            data.action === "restore" ||
            data.action === "mark_cooked"
                ? data.action
                : "update",
        snapshot: normalizeRecipe(
            { id: recipeId, ...(data.snapshot ?? {}) },
            householdId,
            typeof data.createdBy === "string" ? data.createdBy : "unknown-user"
        ),
        createdBy: typeof data.createdBy === "string" ? data.createdBy : "unknown-user",
        createdAt: toMillis(data.createdAt),
        expiresAt: toMillis(data.expiresAt),
    };
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
        ).filter((recipe) => !recipe.deletedAt);
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
                ).filter((recipe) => !recipe.deletedAt);
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
        await runTransaction(dbRef, async (transaction) => {
            const currentSnapshot = await transaction.get(ref);
            if (!currentSnapshot.exists()) {
                throw new Error("Recept bestaat niet meer.");
            }

            const current = normalizeRecipe(
                { id: currentSnapshot.id, ...currentSnapshot.data() },
                householdId,
                _userId
            );
            if (recipe.version !== current.version) {
                throw new Error("Dit recept is intussen gewijzigd. Vernieuw en probeer opnieuw.");
            }

            const revisionId = createId();
            transaction.set(
                doc(ref, "recipeRevisions", revisionId),
                revisionDocument(
                    householdId,
                    recipe.id,
                    _userId,
                    "update",
                    currentSnapshot.data(),
                    current.version
                )
            );
            transaction.set(ref, {
                ...recipeDocumentFields(recipe),
                createdAt: currentSnapshot.data().createdAt,
                updatedAt: serverTimestamp(),
                version: current.version + 1,
                lastRevisionId: revisionId,
            });
        });
    }

    async deleteRecipe(householdId: string, userId: string, recipeId: string): Promise<void> {
        const dbRef = ensureDb();
        const recipeRef = doc(dbRef, "households", householdId, "recipes", recipeId);
        const deletionQueueRef = doc(
            dbRef,
            "households",
            householdId,
            "recipeDeletionQueue",
            recipeId
        );
        await runTransaction(dbRef, async (transaction) => {
            const currentSnapshot = await transaction.get(recipeRef);
            if (!currentSnapshot.exists()) {
                return;
            }
            const current = normalizeRecipe(
                { id: recipeId, ...currentSnapshot.data() },
                householdId,
                userId
            );
            if (current.deletedAt) {
                return;
            }

            const revisionId = createId();
            transaction.set(
                doc(recipeRef, "recipeRevisions", revisionId),
                revisionDocument(
                    householdId,
                    recipeId,
                    userId,
                    "delete",
                    currentSnapshot.data(),
                    current.version
                )
            );
            transaction.update(recipeRef, {
                deletedAt: serverTimestamp(),
                deletedBy: userId,
                updatedAt: serverTimestamp(),
                version: current.version + 1,
                lastRevisionId: revisionId,
            });
            transaction.set(deletionQueueRef, {
                householdId,
                recipeId,
                deletedAt: serverTimestamp(),
                purgeAfter: Timestamp.fromMillis(Date.now() + REVISION_RETENTION_MS),
            });
        });
    }

    async restoreRecipe(householdId: string, userId: string, recipeId: string): Promise<void> {
        const dbRef = ensureDb();
        const recipeRef = doc(dbRef, "households", householdId, "recipes", recipeId);
        const deletionQueueRef = doc(
            dbRef,
            "households",
            householdId,
            "recipeDeletionQueue",
            recipeId
        );
        await runTransaction(dbRef, async (transaction) => {
            const currentSnapshot = await transaction.get(recipeRef);
            if (!currentSnapshot.exists()) {
                throw new Error("Recept bestaat niet meer.");
            }
            const current = normalizeRecipe(
                { id: recipeId, ...currentSnapshot.data() },
                householdId,
                userId
            );
            if (!current.deletedAt) {
                return;
            }

            const revisionId = createId();
            transaction.set(
                doc(recipeRef, "recipeRevisions", revisionId),
                revisionDocument(
                    householdId,
                    recipeId,
                    userId,
                    "restore",
                    currentSnapshot.data(),
                    current.version
                )
            );
            transaction.update(recipeRef, {
                deletedAt: deleteField(),
                deletedBy: deleteField(),
                updatedAt: serverTimestamp(),
                version: current.version + 1,
                lastRevisionId: revisionId,
            });
            transaction.delete(deletionQueueRef);
        });
    }

    async loadDeletedRecipes(householdId: string): Promise<Recipe[]> {
        const dbRef = ensureDb();
        const snapshot = await getDocs(collection(dbRef, "households", householdId, "recipes"));
        return snapshot.docs
            .map((item) =>
                normalizeRecipe({ id: item.id, ...item.data() }, householdId, "unknown-user")
            )
            .filter((recipe) => Boolean(recipe.deletedAt))
            .sort((left, right) => (right.deletedAt ?? 0) - (left.deletedAt ?? 0));
    }

    async loadRecipeRevisions(
        householdId: string,
        recipeId: string
    ): Promise<RecipeRevision[]> {
        const dbRef = ensureDb();
        const snapshot = await getDocs(
            collection(
                dbRef,
                "households",
                householdId,
                "recipes",
                recipeId,
                "recipeRevisions"
            )
        );
        return snapshot.docs
            .map((item) => mapRecipeRevision(item.id, item.data(), householdId, recipeId))
            .sort((left, right) => right.createdAt - left.createdAt);
    }

    async restoreRecipeVersion(
        householdId: string,
        userId: string,
        recipeId: string,
        revisionId: string
    ): Promise<void> {
        const dbRef = ensureDb();
        const recipeRef = doc(dbRef, "households", householdId, "recipes", recipeId);
        const targetRevisionRef = doc(recipeRef, "recipeRevisions", revisionId);
        const deletionQueueRef = doc(
            dbRef,
            "households",
            householdId,
            "recipeDeletionQueue",
            recipeId
        );

        await runTransaction(dbRef, async (transaction) => {
            const currentSnapshot = await transaction.get(recipeRef);
            const targetRevisionSnapshot = await transaction.get(targetRevisionRef);
            if (!currentSnapshot.exists() || !targetRevisionSnapshot.exists()) {
                throw new Error("De gekozen receptversie bestaat niet meer.");
            }

            const current = normalizeRecipe(
                { id: recipeId, ...currentSnapshot.data() },
                householdId,
                userId
            );
            const targetData = targetRevisionSnapshot.data().snapshot as
                | DocumentData
                | undefined;
            if (!targetData) {
                throw new Error("De gekozen receptversie is ongeldig.");
            }

            const currentRevisionId = createId();
            transaction.set(
                doc(recipeRef, "recipeRevisions", currentRevisionId),
                revisionDocument(
                    householdId,
                    recipeId,
                    userId,
                    "restore",
                    currentSnapshot.data(),
                    current.version
                )
            );
            const restoredData = { ...targetData };
            delete restoredData.deletedAt;
            delete restoredData.deletedBy;
            transaction.set(recipeRef, {
                ...restoredData,
                householdId,
                createdAt: currentSnapshot.data().createdAt,
                updatedAt: serverTimestamp(),
                version: current.version + 1,
                lastRevisionId: currentRevisionId,
            });
            transaction.delete(deletionQueueRef);
        });
    }

    async markAsCooked(householdId: string, userId: string, recipeId: string): Promise<void> {
        const dbRef = ensureDb();
        const recipeRef = doc(dbRef, "households", householdId, "recipes", recipeId);
        await runTransaction(dbRef, async (transaction) => {
            const currentSnapshot = await transaction.get(recipeRef);
            if (!currentSnapshot.exists()) {
                throw new Error("Recept bestaat niet meer.");
            }
            const current = normalizeRecipe(
                { id: recipeId, ...currentSnapshot.data() },
                householdId,
                userId
            );
            const revisionId = createId();
            transaction.set(
                doc(recipeRef, "recipeRevisions", revisionId),
                revisionDocument(
                    householdId,
                    recipeId,
                    userId,
                    "mark_cooked",
                    currentSnapshot.data(),
                    current.version
                )
            );
            transaction.update(recipeRef, {
                cookingHistory: arrayUnion(Date.now()),
                updatedAt: serverTimestamp(),
                version: current.version + 1,
                lastRevisionId: revisionId,
            });
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

        await this.ensureMembershipDocument(
            userId,
            invite.householdId,
            "member",
            normalizedCode
        );
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
        role: UserRole,
        inviteCode?: string
    ): Promise<void> {
        if (role === "member" && !inviteCode) {
            throw new Error("Een geldige joincode is verplicht.");
        }
        const dbRef = ensureDb();
        const membershipRef = doc(dbRef, "userMemberships", userId);
        const batch = writeBatch(dbRef);
        batch.set(
            membershipRef,
            {
                householdId,
                role,
                joinedAt: serverTimestamp(),
                ...(inviteCode ? { inviteCode } : {}),
            },
        );
        batch.set(
            doc(dbRef, "households", householdId, "members", userId),
            {
                role,
                joinedAt: serverTimestamp(),
            },
        );
        await batch.commit();

        if (inviteCode) {
            await setDoc(membershipRef, { inviteCode: deleteField() }, { merge: true });
        }
    }

    async getBackupStatus(): Promise<BackupStatus | null> {
        const dbRef = ensureDb();
        const snapshot = await getDoc(doc(dbRef, "system", "backupStatus"));
        if (!snapshot.exists()) {
            return null;
        }

        const data = snapshot.data();
        const state =
            data.state === "healthy" ||
            data.state === "running" ||
            data.state === "stale" ||
            data.state === "failed"
                ? data.state
                : "unknown";
        return {
            latestExportAt: toMillis(data.latestExportAt, 0) || undefined,
            latestVerifiedAt: toMillis(data.latestVerifiedAt, 0) || undefined,
            outputUriPrefix:
                typeof data.outputUriPrefix === "string" ? data.outputUriPrefix : undefined,
            state,
            message: typeof data.message === "string" ? data.message : undefined,
        };
    }
}
