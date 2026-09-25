"use client";

import { PRODUCT_FOOTER_TEXT } from "@/lib/product-identity";
import { cn } from "@/lib/utils";

interface ProductFooterProps {
  className?: string;
}

export function ProductFooter({ className }: ProductFooterProps) {
  return (
    <footer
      data-testid="product-footer"
      className={cn(
        "mt-auto border-t border-border bg-card/50 px-4 sm:px-6 py-2.5 text-[11px] text-muted-foreground/60 transition-colors",
        className
      )}
    >
      <div className="flex flex-col sm:flex-row items-center justify-center text-center leading-relaxed">
        <p className="font-normal select-none">
          {PRODUCT_FOOTER_TEXT}
        </p>
      </div>
    </footer>
  );
}

export const Footer = ProductFooter;
