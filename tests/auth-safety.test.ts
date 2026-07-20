import { describe, expect, it } from "vitest";
import {
    assertGoogleSignInIsSafe,
    assertLinkedAccountPreservedUid,
} from "@/lib/firebase/auth-safety";

describe("accountbehoud bij Google-koppeling", () => {
    it("accepteert alleen een koppeling die de anonieme UID behoudt", () => {
        expect(() =>
            assertLinkedAccountPreservedUid("uid-met-recepten", "uid-met-recepten")
        ).not.toThrow();
        expect(() =>
            assertLinkedAccountPreservedUid("uid-met-recepten", "andere-uid")
        ).toThrow(/onverwachte gebruiker/);
    });

    it("blokkeert Google-login die een bestaand anoniem huishouden kan vervangen", () => {
        expect(() =>
            assertGoogleSignInIsSafe({
                membershipChecked: true,
                hasMembership: true,
                currentUserIsAnonymous: true,
            })
        ).toThrow(/Koppel Google eerst/);
        expect(() =>
            assertGoogleSignInIsSafe({
                membershipChecked: true,
                hasMembership: false,
                currentUserIsAnonymous: true,
            })
        ).not.toThrow();
    });

    it("wacht op de membershipcontrole voordat een anonieme UID kan wisselen", () => {
        expect(() =>
            assertGoogleSignInIsSafe({
                membershipChecked: false,
                hasMembership: false,
                currentUserIsAnonymous: true,
            })
        ).toThrow(/Wacht/);
    });
});
