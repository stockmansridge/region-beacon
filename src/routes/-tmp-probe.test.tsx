// @vitest-environment happy-dom
import { it, expect } from "vitest";
import React, { useContext, createContext } from "react";
import { render } from "@testing-library/react";
const C = createContext(1);
function X() { return <b>{useContext(C)}</b>; }
it("probe", () => { const { container } = render(<X />); expect(container.textContent).toBe("1"); });
