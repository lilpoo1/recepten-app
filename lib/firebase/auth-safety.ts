export function assertLinkedAccountPreservedUid(
    anonymousUid: string,
    linkedUid: string
): void {
    if (!anonymousUid || linkedUid !== anonymousUid) {
        throw new Error("Accountkoppeling heeft een onverwachte gebruiker opgeleverd.");
    }
}

export function assertGoogleSignInIsSafe(input: {
    membershipChecked: boolean;
    hasMembership: boolean;
    currentUserIsAnonymous: boolean;
}): void {
    if (!input.membershipChecked) {
        throw new Error("Wacht tot het bestaande huishouden is gecontroleerd.");
    }
    if (input.hasMembership && input.currentUserIsAnonymous) {
        throw new Error(
            "Koppel Google eerst aan dit bestaande huishouden om de recepten te behouden."
        );
    }
}
