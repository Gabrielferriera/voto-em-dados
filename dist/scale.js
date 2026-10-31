/* Shared, comparable numeric domains for both map renderers. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.AtlasScale = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const DIVERGING = ["delta", "pp", "margin", "turnout"];
  function value(r, metric, candidate) {
    const a = r.turns["1"], b = r.turns["2"];
    if (metric === "margin")
      return (b.votes["13"] - b.votes["22"]) - (a.votes["13"] - a.votes["22"]);
    if (metric === "turnout") return b.turnout - a.turnout;
    const x = a.votes[candidate], y = b.votes[candidate];
    if (x == null || y == null) return null;
    if (metric === "delta") return y - x;
    if (metric === "votes") return y;
    if (a.valid <= 0 || b.valid <= 0) return null;
    if (metric === "pp") return (y / b.valid - x / a.valid) * 100;
    if (metric === "share") return (y / b.valid) * 100;
    return null;
  }
  function key(metric, candidate) {
    return DIVERGING.includes(metric) && ["margin", "turnout"].includes(metric)
      ? metric : metric + ":" + candidate;
  }
  function compute(records) {
    const domains = {};
    for (const metric of ["delta", "pp", "votes", "share", "margin", "turnout"]) {
      for (const candidate of ["13", "22"]) {
        const k = key(metric, candidate);
        if (domains[k] !== undefined) continue;
        const values = records.map((r) => value(r, metric, candidate))
          .filter(Number.isFinite);
        domains[k] = metric === "share" ? 100 :
          Math.max(1, ...values.map((v) => DIVERGING.includes(metric) ? Math.abs(v) : v));
      }
    }
    return domains;
  }
  function max(manifest, fixed, granularity, metric, candidate, values) {
    const local = Math.max(1, ...values.filter(Number.isFinite).map(Math.abs));
    if (!fixed) return local;
    const shared = manifest?.levels?.[granularity]?.[key(metric, candidate)];
    if (!Number.isFinite(shared) || shared <= 0) throw Error("Escala fixa indisponível");
    return shared;
  }
  return { value, key, compute, max, DIVERGING };
});
