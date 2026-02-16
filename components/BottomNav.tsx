"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function BottomNav() {
    const pathname = usePathname();

    if (pathname.startsWith("/household") || pathname.startsWith("/bring/share")) {
        return null;
    }

    const navItems = [
        { name: "Recepten", href: "/recipes", icon: "/recepten-icon.svg" },
        { name: "Weekmenu", href: "/planner", icon: "/weekmenu-icon.svg" },
        { name: "Boodschappen", href: "/shopping-list", icon: "/boodschappen-icon.svg" },
    ];

    return (
        <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white shadow-lg pb-safe">
            <div className="flex h-16 items-center justify-around">
                {navItems.map((item) => {
                    const isActive = pathname === item.href || (item.href === "/recipes" && pathname === "/");
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex h-full w-full flex-col items-center justify-center space-y-1 ${isActive ? "text-green-600" : "text-gray-500"
                                }`}
                        >
                            <span
                                aria-hidden="true"
                                className={`h-5 w-5 bg-current ${isActive ? "opacity-100" : "opacity-70"}`}
                                style={{
                                    maskImage: `url(${item.icon})`,
                                    WebkitMaskImage: `url(${item.icon})`,
                                    maskRepeat: "no-repeat",
                                    WebkitMaskRepeat: "no-repeat",
                                    maskPosition: "center",
                                    WebkitMaskPosition: "center",
                                    maskSize: "contain",
                                    WebkitMaskSize: "contain",
                                }}
                            />
                            <span className="text-xs font-medium">{item.name}</span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
