import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import fs from "fs";
import path from "path";
import * as ProductIdentity from "@/lib/product-identity";
import { ProductFooter, Footer } from "@/components/dashboard/footer";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";

describe("Product Identity Source of Truth", () => {
  it("exports exact approved identity constants", () => {
    expect(ProductIdentity.PRODUCT_NAME).toBe("RusSilica BI Terminal");
    expect(ProductIdentity.PRODUCT_VERSION).toBe("3.1");
    expect(ProductIdentity.PRODUCT_COPYRIGHT_YEAR).toBe("2027");
    expect(ProductIdentity.PRODUCT_INSTITUTIONAL_DESCRIPTION).toBe(
      "Корпоративная система коммерческой аналитики и управления CRM-данными"
    );
    expect(ProductIdentity.PRODUCT_LOADING_DESCRIPTION).toBe(
      "Корпоративная аналитическая система, объединяющая клиентов, сделки, образцы и коммерческие процессы в единую управленческую картину."
    );
    expect(ProductIdentity.PRODUCT_FOOTER_TEXT).toBe(
      "RusSilica BI Terminal v3.1 · Корпоративная система коммерческой аналитики и управления CRM-данными · © 2027 RusSilica"
    );
  });
});

describe("ProductFooter Component", () => {
  it("renders exact approved user-facing footer text", () => {
    render(<ProductFooter />);
    const footer = screen.getByTestId("product-footer");
    expect(footer).toBeInTheDocument();
    expect(footer.textContent?.trim()).toBe(
      "RusSilica BI Terminal v3.1 · Корпоративная система коммерческой аналитики и управления CRM-данными · © 2027 RusSilica"
    );
  });

  it("Footer alias renders the exact same component", () => {
    render(<Footer />);
    expect(
      screen.getByText(
        "RusSilica BI Terminal v3.1 · Корпоративная система коммерческой аналитики и управления CRM-данными · © 2027 RusSilica"
      )
    ).toBeInTheDocument();
  });
});

describe("Required Footer Coverage across Major Pages", () => {
  const routes = [
    { name: "Deals / Dashboard", file: "src/app/page.tsx", componentName: "Footer" },
    { name: "Companies", file: "src/app/companies/page.tsx", componentName: "ProductFooter" },
    { name: "Samples", file: "src/app/samples/page.tsx", componentName: "ProductFooter" },
    { name: "Commercial Funnel", file: "src/app/commercial-funnel/page.tsx", componentName: "ProductFooter" },
  ];

  routes.forEach(({ name, file, componentName }) => {
    it(`guarantees footer is present and rendered in ${name} (${file})`, () => {
      const fullPath = path.resolve(process.cwd(), file);
      const content = fs.readFileSync(fullPath, "utf-8");
      // Must import footer component
      expect(content).toMatch(/import\s+.*(Footer|ProductFooter).*\s+from\s+["']@\/components\/dashboard\/footer["']/);
      // Must render footer element in JSX
      expect(content).toMatch(new RegExp(`<(${componentName}|Footer|ProductFooter)\\s*(\\/|>|\\s)`));
    });
  });
});

describe("Shared Sticky Table Mechanism (Level A Structural Testing)", () => {
  it("renders Table with sticky TableHeader and TableHead with opaque background and z-20", () => {
    render(
      <Table containerClassName="h-96">
        <TableHeader>
          <TableRow>
            <TableHead>Колонка 1</TableHead>
            <TableHead>Колонка 2</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Данные 1</TableCell>
            <TableCell>Данные 2</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );

    const container = screen.getByRole("table").parentElement;
    expect(container).toHaveAttribute("data-slot", "table-container");
    expect(container?.className).toContain("overflow-auto");
    expect(container?.className).toContain("h-96");

    const thead = container?.querySelector("thead");
    expect(thead).toHaveAttribute("data-slot", "table-header");
    expect(thead?.className).toContain("sticky");
    expect(thead?.className).toContain("z-20");
    expect(thead?.className).toContain("bg-card");

    const ths = container?.querySelectorAll("th");
    expect(ths?.length).toBe(2);
    ths?.forEach((th) => {
      expect(th.className).toContain("sticky");
      expect(th.className).toContain("z-20");
      expect(th.className).toContain("bg-card");
      expect(th.className).toContain("border-b");
    });
  });
});
