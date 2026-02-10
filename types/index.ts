export interface Ingredient {
    name: string;
    amount: number;
    unit: string;
}

export type UserRole = "owner" | "member";
export type MealType = "dinner" | "lunch" | "other";
export type StorageMode = "firebase" | "local";

export interface EntityMeta {
    householdId: string;
    createdBy: string;
    createdAt: number;
    updatedAt: number;
    version: number;
}

export interface Recipe {
    id: string;
    householdId: string;
    createdBy: string;
    title: string;
    description?: string;
    image?: string; // Data URL or path
    ingredients: Ingredient[];
    baseServings: number;
    steps: string[];
    prepTimeMinutes?: number;
    difficulty?: 1 | 2 | 3 | 4 | 5;
    tags: string[];
    notes?: string;
    cookingHistory: number[]; // Array of timestamps
    createdAt: number;
    updatedAt: number;
    version: number;
}

export interface MealPlanEntry {
    id: string;
    date: string; // ISO date string YYYY-MM-DD
    householdId: string;
    createdBy: string;
    recipeId: string;
    servings: number;
    mealType: MealType;
    createdAt: number;
    updatedAt: number;
    version: number;
}

export interface ShoppingItem extends Ingredient {
    checked: boolean;
    recipeId?: string; // Optional reference to source recipe
}

export interface BringShareItem {
    name: string;
    amount: number;
    unit: string;
}

export interface BringShareSnapshot {
    token: string;
    householdId: string;
    createdBy: string;
    createdAt: number;
    expiresAt: number;
    title: string;
    items: BringShareItem[];
    servings: number;
    sourceWeekStart: string;
}

export interface BringShareSnapshotInput {
    title: string;
    items: BringShareItem[];
    servings: number;
    sourceWeekStart: string;
}

export interface BringShareSnapshotResult {
    token: string;
    url: string;
    expiresAt: number;
    title: string;
}

export type SortOption = "name" | "last_eaten" | "created" | "time";

export interface Household {
    id: string;
    name: string;
    ownerUid: string;
    activeInviteCode?: string;
    createdAt: number;
    updatedAt: number;
}

export interface Membership {
    uid: string;
    householdId: string;
    role: UserRole;
    joinedAt: number;
}

export interface InviteCode {
    code: string;
    householdId: string;
    createdBy: string;
    active: boolean;
    createdAt: number;
    expiresAt?: number;
    revokedAt?: number;
}

export interface AppUser {
    uid: string;
    isAnonymous: boolean;
}

export interface MigrationStatus {
    householdId: string;
    sourceRecipeCount: number;
    sourceMealPlanCount: number;
    done: boolean;
    importedAt?: number;
    dismissedAt?: number;
}

export interface RecipeDraft {
    title: string;
    description?: string;
    image?: string;
    ingredients: Ingredient[];
    baseServings: number;
    steps: string[];
    prepTimeMinutes?: number;
    difficulty?: 1 | 2 | 3 | 4 | 5;
    tags: string[];
    notes?: string;
}

export interface MealPlanDraft {
    date: string;
    recipeId: string;
    servings: number;
    mealType: MealType;
}
