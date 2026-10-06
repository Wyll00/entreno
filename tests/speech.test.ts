import { describe, expect, it } from "vitest";
import { mergeSegments } from "../src/lib/speech.ts";

describe("unión de fragmentos dictados", () => {
  it("Chrome de escritorio: fragmentos sucesivos se suman", () => {
    expect(mergeSegments(["press de banca", "60 kilos", "8 repeticiones"])).toBe("press de banca 60 kilos 8 repeticiones");
  });
  it("Chrome Android: resultados acumulativos no se duplican", () => {
    expect(mergeSegments(["press", "press de banca", "press de banca 60 kilos"])).toBe("press de banca 60 kilos");
  });
  it("un fragmento repetido al final no se duplica", () => {
    expect(mergeSegments(["press de banca 60 kilos", "60 kilos"])).toBe("press de banca 60 kilos");
  });
  it("tras una pausa (otro arranque) se continúa", () => {
    expect(mergeSegments(["press de banca 60 kilos", "ocho repeticiones tres series"])).toBe(
      "press de banca 60 kilos ocho repeticiones tres series",
    );
  });
});
