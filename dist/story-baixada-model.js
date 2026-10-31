(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.BaixadaStoryModel = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function build(context, municipalities) {
    const group = context.groups.find((g) => g.id === "baixada");
    if (!group) throw Error("Recorte da Baixada ausente");
    const codes = new Set(group.members.map(String));
    const rows = municipalities.filter((r) => codes.has(String(r.ibge)));
    if (rows.length !== codes.size || new Set(rows.map((r) => String(r.ibge))).size !== codes.size)
      throw Error("Cobertura municipal incompleta no recorte");
    const sum = (turn, read) => rows.reduce((total, row) => total + read(row.turns[turn]), 0);
    const totals = Object.fromEntries(["1", "2"].map((t) => [t, {
      lula: sum(t, (s) => s.votes["13"]),
      flavio: sum(t, (s) => s.votes["22"]),
      valid: sum(t, (s) => s.valid),
      turnout: sum(t, (s) => s.turnout),
      abstention: sum(t, (s) => s.abstention),
    }]));
    const places = rows.map((r) => ({
      record: r,
      margin: (r.turns["2"].votes["13"] - r.turns["2"].votes["22"]) -
        (r.turns["1"].votes["13"] - r.turns["1"].votes["22"]),
      turnout: r.turns["2"].turnout - r.turns["1"].turnout,
    }));
    const balance1 = totals["1"].lula - totals["1"].flavio;
    const balance2 = totals["2"].lula - totals["2"].flavio;
    return {
      group, rows, places, totals, balance1, balance2,
      marginChange: balance2 - balance1,
      turnoutChange: totals["2"].turnout - totals["1"].turnout,
      lulaGain: totals["2"].lula - totals["1"].lula,
      flavioGain: totals["2"].flavio - totals["1"].flavio,
    };
  }
  return { build };
});
