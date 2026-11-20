import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QuantityStepper } from "@retail/common";

afterEach(() => {
  cleanup();
});

describe("QuantityStepper (SPEC-WRTL1)", () => {
  it("increments integer quantities by one", () => {
    const onChange = vi.fn();
    render(
      <QuantityStepper value={1} onChange={onChange} aria-label="Cantidad" />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Aumentar" }));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("increments decimal quantities with precision 4", () => {
    const onChange = vi.fn();
    render(
      <QuantityStepper
        value={1.5}
        onChange={onChange}
        allowDecimals
        precision={4}
        aria-label="Peso"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Aumentar" }));
    expect(onChange).toHaveBeenLastCalledWith(1.75);

    fireEvent.change(screen.getByLabelText("Peso"), { target: { value: "2,3456" } });
    expect(onChange).toHaveBeenLastCalledWith(2.3456);
  });

  it("clamps decimal input to the configured precision", () => {
    const onChange = vi.fn();
    render(
      <QuantityStepper
        value={0}
        onChange={onChange}
        allowDecimals
        precision={4}
        aria-label="Peso"
      />,
    );

    fireEvent.change(screen.getByLabelText("Peso"), { target: { value: "0.123456" } });
    expect(onChange).toHaveBeenLastCalledWith(0.1235);
  });

  it("respects min and max bounds", () => {
    const onChange = vi.fn();
    render(
      <QuantityStepper
        value={2}
        onChange={onChange}
        min={2}
        max={3}
        aria-label="Cantidad"
      />,
    );

    expect(screen.getByRole("button", { name: "Disminuir" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Aumentar" }));
    expect(onChange).toHaveBeenCalledWith(3);
  });
});
