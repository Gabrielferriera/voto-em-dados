(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.VoteAnalytics = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function candidate(record, number) {
    const a = record.turns["1"],
      b = record.turns["2"];
    const x = a.votes[number],
      y = b.votes[number];
    const comparable = x != null && y != null;
    return {
      x,
      y,
      d: comparable ? y - x : null,
      p:
        comparable && a.valid > 0 && b.valid > 0
          ? (y / b.valid - x / a.valid) * 100
          : null,
    };
  }
  function decompose(record, number) {
    const a = record.turns["1"],
      b = record.turns["2"];
    if (
      !(a.valid > 0 && b.valid > 0) ||
      a.votes[number] == null ||
      b.votes[number] == null
    )
      return null;
    const s1 = a.votes[number] / a.valid,
      s2 = b.votes[number] / b.valid;
    return {
      volume: ((s1 + s2) / 2) * (b.valid - a.valid),
      share: ((a.valid + b.valid) / 2) * (s2 - s1),
      total: b.votes[number] - a.votes[number],
    };
  }
  function summarize(records, number) {
    const gains = records
      .filter((r) => candidate(r, number).d > 0)
      .slice()
      .sort((a, b) => candidate(b, number).d - candidate(a, number).d);
    const gross = gains.reduce((sum, r) => sum + candidate(r, number).d, 0);
    const loss = records.reduce(
      (sum, r) => sum + Math.min(candidate(r, number).d || 0, 0),
      0,
    );
    const top = gains.slice(0, 5),
      topTotal = top.reduce((sum, r) => sum + candidate(r, number).d, 0);
    let to13 = 0,
      to22 = 0,
      ties = 0,
      unavailable = 0;
    for (const r of records) {
      if (!r.turns["1"].valid || !r.turns["2"].valid) {
        unavailable++;
        continue;
      }
      const a = r.turns["1"].votes,
        b = r.turns["2"].votes;
      if ([a["13"], a["22"], b["13"], b["22"]].some((v) => v == null)) continue;
      const w1 = Math.sign(a["13"] - a["22"]),
        w2 = Math.sign(b["13"] - b["22"]);
      if (!w1 || !w2) {
        ties++;
        continue;
      }
      if (w1 < 0 && w2 > 0) to13++;
      if (w1 > 0 && w2 < 0) to22++;
    }
    return { gains, gross, loss, top, topTotal, to13, to22, ties, unavailable };
  }
  function marginChange(r) {
    return (
      r.turns["2"].votes["13"] -
      r.turns["2"].votes["22"] -
      (r.turns["1"].votes["13"] - r.turns["1"].votes["22"])
    );
  }
  function aggregate(records, meta) {
    if (!records.length) return null;
    const result = {
      ...meta,
      level: "region",
      uf: "rj",
      members: records.map((r) => String(r.ibge)),
      turns: {},
    };
    for (const t of ["1", "2"]) {
      const turn = { votes: {} };
      for (const r of records) {
        const a = r.turns[t];
        for (const [key, v] of Object.entries(a)) {
          if (key === "votes") {
            for (const [n, count] of Object.entries(v))
              turn.votes[n] = (turn.votes[n] || 0) + count;
          } else if (typeof v === "number" && !["generationId"].includes(key)) {
            turn[key] = (turn[key] || 0) + v;
          }
        }
      }
      turn.source = records[0].turns[t].source;
      result.turns[t] = turn;
    }
    return result;
  }
  function correlation(pairs) {
    if (pairs.length < 3) return null;
    const n = pairs.length,
      mx = pairs.reduce((s, p) => s + p[0], 0) / n,
      my = pairs.reduce((s, p) => s + p[1], 0) / n;
    let cross = 0,
      xx = 0,
      yy = 0;
    for (const [x, y] of pairs) {
      cross += (x - mx) * (y - my);
      xx += (x - mx) ** 2;
      yy += (y - my) ** 2;
    }
    return xx && yy ? cross / Math.sqrt(xx * yy) : null;
  }
  return {
    candidate,
    decompose,
    summarize,
    marginChange,
    aggregate,
    correlation,
  };
});
