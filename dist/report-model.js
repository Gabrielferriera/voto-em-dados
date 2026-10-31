(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ReportModel = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const rate = (numerator, denominator) =>
    denominator > 0 && Number.isFinite(numerator)
      ? (100 * numerator) / denominator
      : null;
  const diff = (a, b) =>
    a == null || b == null ? null : b - a;
  function summarize(r) {
    const a = r.turns["1"], b = r.turns["2"];
    const candidate = (n) => {
      const x = a.votes[n] ?? null, y = b.votes[n] ?? null;
      const p1 = rate(x, a.valid), p2 = rate(y, b.valid);
      return { x, y, p1, p2, delta: diff(x, y), pp: diff(p1, p2) };
    };
    const turnout1 = rate(a.turnout, a.turnout + a.abstention);
    const turnout2 = rate(b.turnout, b.turnout + b.abstention);
    return {
      candidates: { "13": candidate("13"), "22": candidate("22") },
      turnout: { x: a.turnout, y: b.turnout, delta: diff(a.turnout, b.turnout),
        p1: turnout1, p2: turnout2, pp: diff(turnout1, turnout2) },
      rows: ["valid", "blank", "null", "abstention"].map((key) => ({
        key, x: a[key], y: b[key], delta: diff(a[key], b[key]),
      })),
      margin: a.votes["13"] == null || a.votes["22"] == null ||
        b.votes["13"] == null || b.votes["22"] == null ? null :
        (b.votes["13"] - b.votes["22"]) - (a.votes["13"] - a.votes["22"]),
    };
  }
  return { summarize, rate };
});
