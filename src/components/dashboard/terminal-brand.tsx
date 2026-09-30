import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { PRODUCT_BRAND_NAME, PRODUCT_UI_DESCRIPTOR } from "@/lib/product-identity";

export interface TerminalBrandProps {
  className?: string;
}

export function TerminalBrand({ className }: TerminalBrandProps) {
  return (
    <Link
      href="/"
      className={`flex items-center gap-2.5 shrink-0 hover:opacity-80 transition-opacity cursor-pointer ${className ?? ""}`}
    >
      <BarChart3 className="h-5 w-5 text-white/80 shrink-0" />
      <span className="text-sm font-semibold tracking-wide text-white">
        {PRODUCT_BRAND_NAME}
      </span>
      <span className="hidden md:inline text-xs font-normal text-white/40">
        {PRODUCT_UI_DESCRIPTOR}
      </span>
    </Link>
  );
}
