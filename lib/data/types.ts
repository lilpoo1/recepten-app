import {
    BringShareSnapshotInput,
    BringShareSnapshotResult,
    Household,
    InviteCode,
    MealPlanDraft,
    MealPlanEntry,
    Membership,
    BackupStatus,
    Recipe,
    RecipeDraft,
    RecipeRevision,
    UserRole,
} from "@/types";

export interface HouseholdSnapshot {
    recipes: Recipe[];
    mealPlan: MealPlanEntry[];
}

export type Unsubscribe = () => void;

export interface DataSource {
    readonly mode: "local" | "firebase";
    loadHouseholdData(householdId: string): Promise<HouseholdSnapshot>;
    watchHouseholdData(
        householdId: string,
        onChange: (snapshot: HouseholdSnapshot) => void
    ): Unsubscribe;
    addRecipe(householdId: string, userId: string, recipe: RecipeDraft): Promise<string>;
    updateRecipe(householdId: string, userId: string, recipe: Recipe): Promise<void>;
    deleteRecipe(householdId: string, userId: string, recipeId: string): Promise<void>;
    restoreRecipe(householdId: string, userId: string, recipeId: string): Promise<void>;
    loadDeletedRecipes(householdId: string): Promise<Recipe[]>;
    loadRecipeRevisions(householdId: string, recipeId: string): Promise<RecipeRevision[]>;
    restoreRecipeVersion(
        householdId: string,
        userId: string,
        recipeId: string,
        revisionId: string
    ): Promise<void>;
    markAsCooked(householdId: string, userId: string, recipeId: string): Promise<void>;
    upsertMealPlanEntry(householdId: string, userId: string, draft: MealPlanDraft): Promise<void>;
    removeMealPlanEntry(
        householdId: string,
        date: string,
        recipeId: string,
        mealType: MealPlanEntry["mealType"]
    ): Promise<void>;
    createBringShareSnapshot(
        householdId: string,
        userId: string,
        input: BringShareSnapshotInput,
        baseUrl: string
    ): Promise<BringShareSnapshotResult>;
}

export interface HouseholdDataSource {
    getMembership(userId: string): Promise<Membership | null>;
    createHousehold(userId: string, name: string): Promise<Household>;
    joinHousehold(userId: string, code: string): Promise<Membership>;
    getHousehold(householdId: string): Promise<Household | null>;
    refreshInviteCode(household: Household, userId: string): Promise<InviteCode>;
    revokeInviteCode(household: Household): Promise<void>;
    getInviteCode(code: string): Promise<InviteCode | null>;
    getMigrationState(householdId: string): Promise<{ done: boolean; importedAt?: number }>;
    setMigrationDone(householdId: string): Promise<void>;
    ensureMembershipDocument(
        userId: string,
        householdId: string,
        role: UserRole,
        inviteCode?: string
    ): Promise<void>;
    getBackupStatus(): Promise<BackupStatus | null>;
}
