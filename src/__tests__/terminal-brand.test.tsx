import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TerminalBrand } from "@/components/dashboard/terminal-brand";
import { PRODUCT_BRAND_NAME, PRODUCT_UI_DESCRIPTOR } from "@/lib/product-identity";

describe("TerminalBrand", () => {
  it("renders the authoritative brand name and UI descriptor", () => {
    render(<TerminalBrand />);
    expect(screen.getByText(PRODUCT_BRAND_NAME)).toBeInTheDocument();
    expect(screen.getByText(PRODUCT_UI_DESCRIPTOR)).toBeInTheDocument();
  });

  it("links to home (/)", () => {
    render(<TerminalBrand />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/");
  });
});
