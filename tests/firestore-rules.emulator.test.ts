import { readFileSync } from "node:fs";
import {
    assertFails,
    assertSucceeds,
    initializeTestEnvironment,
    RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
    collection,
    deleteField,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    serverTimestamp,
    setDoc,
    Timestamp,
    updateDoc,
    writeBatch,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

const emulatorAvailable = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const describeWithEmulator = emulatorAvailable ? describe : describe.skip;
const projectId = "recepten-rules-test";
let environment: RulesTestEnvironment;

function recipe(householdId: string, createdBy: string) {
    const now = Timestamp.fromMillis(Date.now());
    return {
        householdId,
        createdBy,
        title: "Veilig recept",
        description: "",
        ingredients: [{ name: "Tomaat", quantityText: "2" }],
        baseServings: 2,
        steps: ["Snijd"],
        tags: [],
        notes: "",
        cookingHistory: [],
        createdAt: now,
        updatedAt: now,
        version: 1,
    };
}

async function seed() {
    await environment.withSecurityRulesDisabled(async (context) => {
        const database = context.firestore();
        await setDoc(doc(database, "userMemberships", "user-a"), {
            householdId: "household-a",
            role: "owner",
            joinedAt: Timestamp.now(),
        });
        await setDoc(doc(database, "userMemberships", "user-b"), {
            householdId: "household-b",
            role: "owner",
            joinedAt: Timestamp.now(),
        });
        await setDoc(doc(database, "households", "household-a"), {
            name: "A",
            ownerUid: "user-a",
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
        });
        await setDoc(doc(database, "households", "household-b"), {
            name: "B",
            ownerUid: "user-b",
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
        });
        await setDoc(
            doc(database, "households", "household-a", "recipes", "recipe-a"),
            recipe("household-a", "user-a")
        );
        await setDoc(
            doc(database, "households", "household-b", "recipes", "recipe-b"),
            recipe("household-b", "user-b")
        );
    });
}

describeWithEmulator("Firestore recipe recovery rules", () => {
    beforeAll(async () => {
        environment = await initializeTestEnvironment({
            projectId,
            firestore: {
                rules: readFileSync("firestore.rules", "utf8"),
            },
        });
    });

    beforeEach(async () => {
        await environment.clearFirestore();
        await seed();
    });

    afterAll(async () => {
        await environment.cleanup();
    });

    it("weigert harde deletes door een huishoudlid", async () => {
        const database = environment.authenticatedContext("user-a").firestore();
        await assertFails(
            deleteDoc(doc(database, "households", "household-a", "recipes", "recipe-a"))
        );
    });

    it("blokkeert ook een foutieve release die alle recepten hard verwijdert", async () => {
        const database = environment.authenticatedContext("user-a").firestore();
        const batch = writeBatch(database);
        batch.delete(
            doc(database, "households", "household-a", "recipes", "recipe-a")
        );
        await assertFails(batch.commit());
        await assertSucceeds(
            getDoc(doc(database, "households", "household-a", "recipes", "recipe-a"))
        );
    });

    it("weigert een update zonder exacte vorige revision", async () => {
        const database = environment.authenticatedContext("user-a").firestore();
        await assertFails(
            setDoc(
                doc(database, "households", "household-a", "recipes", "recipe-a"),
                {
                    ...recipe("household-a", "user-a"),
                    title: "Onbeschermde wijziging",
                    version: 2,
                    lastRevisionId: "missing",
                }
            )
        );
    });

    it("staat een atomaire update met exacte vorige revision toe", async () => {
        const database = environment.authenticatedContext("user-a").firestore();
        const recipeRef = doc(
            database,
            "households",
            "household-a",
            "recipes",
            "recipe-a"
        );
        const oldSnapshot = (await getDoc(recipeRef)).data();
        const revisionRef = doc(recipeRef, "recipeRevisions", "revision-1");
        const batch = writeBatch(database);
        batch.set(revisionRef, {
            householdId: "household-a",
            recipeId: "recipe-a",
            version: 1,
            action: "update",
            snapshot: oldSnapshot,
            createdBy: "user-a",
            createdAt: serverTimestamp(),
            expiresAt: Timestamp.fromMillis(Date.now() + 98 * 24 * 60 * 60 * 1000),
        });
        batch.set(recipeRef, {
            ...oldSnapshot,
            title: "Beschermde wijziging",
            updatedAt: serverTimestamp(),
            version: 2,
            lastRevisionId: "revision-1",
        });
        await assertSucceeds(batch.commit());
    });

    it("maakt revisions onveranderlijk", async () => {
        const database = environment.authenticatedContext("user-a").firestore();
        const recipeRef = doc(
            database,
            "households",
            "household-a",
            "recipes",
            "recipe-a"
        );
        const oldSnapshot = (await getDoc(recipeRef)).data();
        const revisionRef = doc(recipeRef, "recipeRevisions", "revision-1");
        const batch = writeBatch(database);
        batch.set(revisionRef, {
            householdId: "household-a",
            recipeId: "recipe-a",
            version: 1,
            action: "delete",
            snapshot: oldSnapshot,
            createdBy: "user-a",
            createdAt: serverTimestamp(),
            expiresAt: Timestamp.fromMillis(Date.now() + 98 * 24 * 60 * 60 * 1000),
        });
        batch.update(recipeRef, {
            deletedAt: serverTimestamp(),
            deletedBy: "user-a",
            updatedAt: serverTimestamp(),
            version: 2,
            lastRevisionId: "revision-1",
        });
        await assertSucceeds(batch.commit());
        await assertFails(setDoc(revisionRef, { action: "update" }, { merge: true }));
        await assertFails(deleteDoc(revisionRef));
    });

    it("verwijdert en herstelt atomair met een geldige revision en wachtrij", async () => {
        const database = environment.authenticatedContext("user-a").firestore();
        const recipeRef = doc(
            database,
            "households",
            "household-a",
            "recipes",
            "recipe-a"
        );
        const queueRef = doc(
            database,
            "households",
            "household-a",
            "recipeDeletionQueue",
            "recipe-a"
        );
        const beforeDelete = (await getDoc(recipeRef)).data();
        const deletedAt = Timestamp.now();
        const deleteRevision = doc(
            recipeRef,
            "recipeRevisions",
            "delete-revision"
        );
        const deleteBatch = writeBatch(database);
        deleteBatch.set(deleteRevision, {
            householdId: "household-a",
            recipeId: "recipe-a",
            version: 1,
            action: "delete",
            snapshot: beforeDelete,
            createdBy: "user-a",
            createdAt: serverTimestamp(),
            expiresAt: Timestamp.fromMillis(Date.now() + 98 * 24 * 60 * 60 * 1000),
        });
        deleteBatch.update(recipeRef, {
            deletedAt,
            deletedBy: "user-a",
            updatedAt: serverTimestamp(),
            version: 2,
            lastRevisionId: "delete-revision",
        });
        deleteBatch.set(queueRef, {
            householdId: "household-a",
            recipeId: "recipe-a",
            deletedAt,
            purgeAfter: Timestamp.fromMillis(Date.now() + 98 * 24 * 60 * 60 * 1000),
        });
        await assertSucceeds(deleteBatch.commit());
        await assertFails(deleteDoc(queueRef));

        const beforeRestore = (await getDoc(recipeRef)).data();
        const restoreRevision = doc(
            recipeRef,
            "recipeRevisions",
            "restore-revision"
        );
        const restoreBatch = writeBatch(database);
        restoreBatch.set(restoreRevision, {
            householdId: "household-a",
            recipeId: "recipe-a",
            version: 2,
            action: "restore",
            snapshot: beforeRestore,
            createdBy: "user-a",
            createdAt: serverTimestamp(),
            expiresAt: Timestamp.fromMillis(Date.now() + 98 * 24 * 60 * 60 * 1000),
        });
        const restored = { ...(beforeRestore ?? {}) };
        delete restored.deletedAt;
        delete restored.deletedBy;
        restoreBatch.set(recipeRef, {
            ...restored,
            updatedAt: serverTimestamp(),
            version: 3,
            lastRevisionId: "restore-revision",
        });
        restoreBatch.delete(queueRef);
        await assertSucceeds(restoreBatch.commit());

        const result = (await getDoc(recipeRef)).data();
        if (!result) {
            throw new Error("Hersteld recept ontbreekt.");
        }
        if ("deletedAt" in result || "deletedBy" in result || result.version !== 3) {
            throw new Error("Soft-deletevelden zijn niet atomair hersteld.");
        }
    });

    it("herstelt een eerdere receptversie en bewaart de vervangen versie atomair", async () => {
        const database = environment.authenticatedContext("user-a").firestore();
        const recipeRef = doc(
            database,
            "households",
            "household-a",
            "recipes",
            "recipe-a"
        );
        const versionOne = (await getDoc(recipeRef)).data();
        if (!versionOne) {
            throw new Error("Startversie ontbreekt.");
        }

        const versionOneRevision = doc(
            recipeRef,
            "recipeRevisions",
            "version-one"
        );
        const updateBatch = writeBatch(database);
        updateBatch.set(versionOneRevision, {
            householdId: "household-a",
            recipeId: "recipe-a",
            version: 1,
            action: "update",
            snapshot: versionOne,
            createdBy: "user-a",
            createdAt: serverTimestamp(),
            expiresAt: Timestamp.fromMillis(Date.now() + 98 * 24 * 60 * 60 * 1000),
        });
        updateBatch.set(recipeRef, {
            ...versionOne,
            title: "Nieuwere versie",
            updatedAt: serverTimestamp(),
            version: 2,
            lastRevisionId: "version-one",
        });
        await assertSucceeds(updateBatch.commit());

        const versionTwo = (await getDoc(recipeRef)).data();
        if (!versionTwo) {
            throw new Error("Gewijzigde versie ontbreekt.");
        }
        const versionTwoRevision = doc(
            recipeRef,
            "recipeRevisions",
            "version-two-before-restore"
        );
        const deletionQueueRef = doc(
            database,
            "households",
            "household-a",
            "recipeDeletionQueue",
            "recipe-a"
        );
        const restoreBatch = writeBatch(database);
        restoreBatch.set(versionTwoRevision, {
            householdId: "household-a",
            recipeId: "recipe-a",
            version: 2,
            action: "restore",
            snapshot: versionTwo,
            createdBy: "user-a",
            createdAt: serverTimestamp(),
            expiresAt: Timestamp.fromMillis(Date.now() + 98 * 24 * 60 * 60 * 1000),
        });
        restoreBatch.set(recipeRef, {
            ...versionOne,
            createdAt: versionTwo.createdAt,
            updatedAt: serverTimestamp(),
            version: 3,
            lastRevisionId: "version-two-before-restore",
        });
        restoreBatch.delete(deletionQueueRef);
        await assertSucceeds(restoreBatch.commit());

        const restored = (await getDoc(recipeRef)).data();
        const preservedVersionTwo = (await getDoc(versionTwoRevision)).data();
        if (
            !restored ||
            restored.title !== versionOne.title ||
            restored.version !== 3 ||
            restored.lastRevisionId !== "version-two-before-restore"
        ) {
            throw new Error("De gekozen receptversie is niet correct hersteld.");
        }
        if (
            !preservedVersionTwo ||
            preservedVersionTwo.snapshot.title !== "Nieuwere versie" ||
            preservedVersionTwo.version !== 2
        ) {
            throw new Error("De vervangen receptversie is niet bewaard.");
        }
    });

    it("isoleert recepten tussen huishoudens", async () => {
        const database = environment.authenticatedContext("user-a").firestore();
        await assertFails(
            getDoc(doc(database, "households", "household-b", "recipes", "recipe-b"))
        );
    });

    it("weigert zelftoewijzing aan een bestaand huishouden zonder joincode", async () => {
        const database = environment.authenticatedContext("attacker").firestore();
        await assertFails(
            setDoc(doc(database, "userMemberships", "attacker"), {
                householdId: "household-a",
                role: "member",
                joinedAt: serverTimestamp(),
            })
        );
        await assertFails(
            getDoc(doc(database, "households", "household-a", "recipes", "recipe-a"))
        );
    });

    it("maakt een nieuw huishouden alleen in één geldige eigenaarbatch", async () => {
        const database = environment.authenticatedContext("user-c").firestore();
        const batch = writeBatch(database);
        batch.set(doc(database, "households", "household-c"), {
            name: "C",
            ownerUid: "user-c",
            activeInviteCode: "CREATE1",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
        batch.set(doc(database, "userMemberships", "user-c"), {
            householdId: "household-c",
            role: "owner",
            joinedAt: serverTimestamp(),
        });
        batch.set(doc(database, "households", "household-c", "members", "user-c"), {
            role: "owner",
            joinedAt: serverTimestamp(),
        });
        batch.set(doc(database, "householdInvites", "CREATE1"), {
            householdId: "household-c",
            createdBy: "user-c",
            active: true,
            createdAt: serverTimestamp(),
        });
        await assertSucceeds(batch.commit());
    });

    it("laat joinen alleen met een actieve code toe en wist het bewijs daarna", async () => {
        await environment.withSecurityRulesDisabled(async (context) => {
            await setDoc(doc(context.firestore(), "householdInvites", "JOIN12"), {
                householdId: "household-a",
                createdBy: "user-a",
                active: true,
                createdAt: Timestamp.now(),
            });
        });
        const database = environment.authenticatedContext("user-c").firestore();
        const membershipRef = doc(database, "userMemberships", "user-c");
        const batch = writeBatch(database);
        batch.set(membershipRef, {
            householdId: "household-a",
            role: "member",
            joinedAt: serverTimestamp(),
            inviteCode: "JOIN12",
        });
        batch.set(doc(database, "households", "household-a", "members", "user-c"), {
            role: "member",
            joinedAt: serverTimestamp(),
        });
        await assertSucceeds(batch.commit());
        await assertSucceeds(updateDoc(membershipRef, { inviteCode: deleteField() }));
        await assertSucceeds(
            getDoc(doc(database, "households", "household-a", "recipes", "recipe-a"))
        );
        await assertFails(getDocs(collection(database, "householdInvites")));
    });

    it("laat alleen de backupclaim oude soft-deletes definitief verwijderen", async () => {
        await environment.withSecurityRulesDisabled(async (context) => {
            const adminDatabase = context.firestore();
            await setDoc(
                doc(
                    adminDatabase,
                    "households",
                    "household-a",
                    "recipes",
                    "expired"
                ),
                {
                    ...recipe("household-a", "user-a"),
                    deletedAt: Timestamp.fromMillis(
                        Date.now() - 99 * 24 * 60 * 60 * 1000
                    ),
                    deletedBy: "user-a",
                }
            );
            await setDoc(
                doc(
                    adminDatabase,
                    "households",
                    "household-a",
                    "recipeDeletionQueue",
                    "expired"
                ),
                {
                    householdId: "household-a",
                    recipeId: "expired",
                    deletedAt: Timestamp.fromMillis(
                        Date.now() - 99 * 24 * 60 * 60 * 1000
                    ),
                    purgeAfter: Timestamp.fromMillis(Date.now() - 60_000),
                }
            );
        });
        const backup = environment
            .authenticatedContext("backup-cleanup", { backupAutomation: true })
            .firestore();
        await assertSucceeds(
            backup.collectionGroup("recipeDeletionQueue").get()
        );
        const cleanupBatch = backup.batch();
        cleanupBatch.delete(
            backup.doc("households/household-a/recipes/expired")
        );
        cleanupBatch.delete(
            backup.doc("households/household-a/recipeDeletionQueue/expired")
        );
        await assertSucceeds(cleanupBatch.commit());
        await assertFails(
            backup.doc("households/household-a/recipes/recipe-a").delete()
        );
    });

    it("beperkt backupstatuswrites tot de backupclaim", async () => {
        const member = environment.authenticatedContext("user-a").firestore();
        const backup = environment
            .authenticatedContext("backup-status", { backupAutomation: true })
            .firestore();
        const payload = {
            state: "healthy",
            updatedAt: serverTimestamp(),
            latestVerifiedAt: serverTimestamp(),
            message: "ok",
        };
        await assertFails(setDoc(doc(member, "system", "backupStatus"), payload));
        await assertSucceeds(setDoc(doc(backup, "system", "backupStatus"), payload));
    });
});
