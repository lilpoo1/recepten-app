"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function BottomNav() {
    const pathname = usePathname();

    if (pathname.startsWith("/household")) {
        return null;
    }

    const navItems = [
        { name: "Recepten", href: "/", icon: "R" },
        { name: "Weekmenu", href: "/planner", icon: "W" },
        { name: "Boodschappen", href: "/shopping-list", icon: "B" },
    ];

    return (
        <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white shadow-lg pb-safe">
            <div className="flex h-16 items-center justify-around">
                {navItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex h-full w-full flex-col items-center justify-center space-y-1 ${isActive ? "text-green-600" : "text-gray-500"
                                }`}
                        >
                            <span className="text-xl font-semibold">{item.icon}</span>
                            <span className="text-xs font-medium">{item.name}</span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
