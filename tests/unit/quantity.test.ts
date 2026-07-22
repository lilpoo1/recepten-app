import { describe, expect, it } from "vitest";
import {
    classifyUnit,
    composeQuantityTextFromLegacy,
    formatScaledQuantityText,
    parseQuantityText,
    toHumanQuantity,
} from "@/lib/utils/quantity";

describe("quantity utilities", () => {
    it("classificeert bekende Nederlandse eenheden", () => {
        expect(classifyUnit("kg.")).toBe("weight");
        expect(classifyUnit("ml")).toBe("volume");
        expect(classifyUnit("stuks")).toBe("count");
        expect(classifyUnit("eetlepel")).toBe("other");
    });

    it("parseert gehele en Nederlandse decimale hoeveelheden", () => {
        expect(parseQuantityText("1,5 kg")).toMatchObject({
            isParseable: true,
            amount: 1.5,
            unit: "kg",
        });
        expect(parseQuantityText("naar smaak")).toMatchObject({
            isParseable: false,
            rawRemainder: "naar smaak",
        });
    });

    it("schaalt en rondt hoeveelheden menselijk af", () => {
        expect(formatScaledQuantityText("250 g", 2.5)).toBe("625 g");
        expect(formatScaledQuantityText("naar smaak", 3)).toBe("naar smaak");
        expect(formatScaledQuantityText("2 stuks", 0)).toBe("2 stuks");
    });

    it("markeert een sterke afronding als benadering", () => {
        expect(toHumanQuantity(0.2, "stuks")).toMatchObject({
            roundedAmount: 1,
            isApproximate: true,
            displayWithUnit: "± 1 stuks",
        });
    });

    it("zet legacy amount en unit om zonder lege nul", () => {
        expect(composeQuantityTextFromLegacy(2.5, "kg")).toBe("2.5 kg");
        expect(composeQuantityTextFromLegacy(0, "naar smaak")).toBe("naar smaak");
    });
});
