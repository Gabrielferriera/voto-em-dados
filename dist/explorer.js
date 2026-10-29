/* Exploration flows share the official snapshots with the atlas. No inferred individual votes. */
(() => {
  const el = (id) => document.getElementById(id),
    A = VoteAnalytics;
  const f = (n) =>
    n == null || !Number.isFinite(n)
      ? "—"
      : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(n);
  const sign = (n) => (n == null ? "—" : (n > 0 ? "+" : "") + f(n));
  const safe = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  let context,
    rj = [],
    catalog = new Map(),
    comparisonReady = false,
    story = null,
    contextRows = [],
    contextExport = [];
  let contextError = null;
  const ready = Promise.all([
    fetch("data/context-rj.json").then((r) => {
      if (!r.ok) throw Error("Contexto oficial indisponível");
      return r.json();
    }),
    fetch("data/municipalities/rj.json").then((r) => {
      if (!r.ok) throw Error("Base fluminense indisponível");
      return r.json();
    }),
  ])
    .then(([c, records]) => {
      context = c;
      rj = records;
      window.rjContext = c;
      renderRegions();
      refresh();
      return true;
    })
    .catch((e) => {
      contextError = e;
      el("region-definition").textContent =
        "Não foi possível carregar a base de contexto. Tente recarregar.";
      el("context-description").textContent = e.message;
      return false;
    });
  function id(r) {
    return r.level === "region"
      ? "region:" + r.region
      : r.level === "mu"
        ? "mu:" + r.uf + ":" + r.code
        : "uf:" + r.uf;
  }
  function groups() {
    return context?.groups || [];
  }
  function aggregate(group) {
    const aggregated = A.aggregate(
      rj.filter((r) => group.members.includes(String(r.ibge))),
      { code: "region:" + group.id, name: group.name, region: group.id },
    );
    const state = window.atlasData?.states.find((s) => s.uf === "rj");
    if (aggregated && state)
      for (const t of ["1", "2"])
        aggregated.turns[t].source = state.turns[t].source;
    return aggregated;
  }
  function catalogRecords() {
    const records = [...(window.atlasData?.states || []), ...rj];
    if (window.atlasRecord?.uf !== "br" && window.atlasRecord?.uf !== "rj")
      records.push(...(window.atlasAllRows || []));
    for (const group of groups()) {
      const total = aggregate(group);
      if (total) records.push(total);
    }
    if (window.atlasRecord) records.push(window.atlasRecord);
    return records;
  }
  function buildCatalog() {
    const lastA = el("compare-a").value,
      lastB = el("compare-b").value;
    catalog = new Map(catalogRecords().map((r) => [id(r), r]));
    for (const key of ["compare-a", "compare-b"]) {
      el(key).innerHTML = "";
      for (const [title, test] of [
        ["Recortes fluminenses", (r) => r.level === "region"],
        ["Estados e exterior", (r) => r.level === "uf"],
        ["Municípios", (r) => r.level === "mu"],
        ["Brasil", (r) => r.level === "br"],
      ]) {
        const group = document.createElement("optgroup");
        group.label = title;
        for (const [value, r] of catalog) {
          if (!test(r)) continue;
          const o = document.createElement("option");
          o.value = value;
          o.textContent =
            r.name + (r.level === "mu" ? " · " + r.uf.toUpperCase() : "");
          group.append(o);
        }
        if (group.children.length) el(key).append(group);
      }
    }
    const japeri = rj.find((r) => String(r.ibge) === "3302270"),
      niteroi = rj.find((r) => String(r.ibge) === "3303302");
    el("compare-a").value = catalog.has(lastA)
      ? lastA
      : japeri
        ? id(japeri)
        : catalog.keys().next().value;
    el("compare-b").value = catalog.has(lastB)
      ? lastB
      : niteroi
        ? id(niteroi)
        : [...catalog.keys()][1];
    comparisonReady = true;
    renderComparison();
  }
  const rates = (t) =>
    t.turnout + t.abstention
      ? (t.turnout / (t.turnout + t.abstention)) * 100
      : null;
  function comparisonLines() {
    return [
      [
        "Lula · votos · 1º → 2º",
        (r) =>
          f(r.turns["1"].votes["13"]) + " → " + f(r.turns["2"].votes["13"]),
      ],
      [
        "Lula · % dos válidos · 1º → 2º",
        (r) =>
          f((r.turns["1"].votes["13"] / r.turns["1"].valid) * 100) +
          "% → " +
          f((r.turns["2"].votes["13"] / r.turns["2"].valid) * 100) +
          "%",
      ],
      ["Lula · variação de votos", (r) => sign(A.candidate(r, "13").d)],
      [
        "Flávio · votos · 1º → 2º",
        (r) =>
          f(r.turns["1"].votes["22"]) + " → " + f(r.turns["2"].votes["22"]),
      ],
      [
        "Flávio · % dos válidos · 1º → 2º",
        (r) =>
          f((r.turns["1"].votes["22"] / r.turns["1"].valid) * 100) +
          "% → " +
          f((r.turns["2"].votes["22"] / r.turns["2"].valid) * 100) +
          "%",
      ],
      ["Flávio · variação de votos", (r) => sign(A.candidate(r, "22").d)],
      [
        "Comparecimento · votos · 1º → 2º",
        (r) => f(r.turns["1"].turnout) + " → " + f(r.turns["2"].turnout),
      ],
      [
        "Comparecimento · taxa · 1º → 2º",
        (r) => f(rates(r.turns["1"])) + "% → " + f(rates(r.turns["2"])) + "%",
      ],
      [
        "Abstenções · 1º → 2º",
        (r) => f(r.turns["1"].abstention) + " → " + f(r.turns["2"].abstention),
      ],
      [
        "Brancos · 1º → 2º",
        (r) => f(r.turns["1"].blank) + " → " + f(r.turns["2"].blank),
      ],
      [
        "Nulos · 1º → 2º",
        (r) => f(r.turns["1"].null) + " → " + f(r.turns["2"].null),
      ],
      [
        "Mudança do saldo Lula − Flávio",
        (r) => sign(A.marginChange(r)) + " votos",
      ],
    ];
  }
  function renderComparison() {
    if (!comparisonReady) return;
    const a = catalog.get(el("compare-a").value),
      b = catalog.get(el("compare-b").value);
    if (!a || !b) return;
    el("comparison").innerHTML =
      `<div class="compare-summary"><div><small>A / ${safe(a.name)}</small><strong>${sign(A.marginChange(a))}</strong><span>votos na mudança do saldo</span></div><div><small>B / ${safe(b.name)}</small><strong>${sign(A.marginChange(b))}</strong><span>votos na mudança do saldo</span></div></div><div class="scroll"><table><thead><tr><th>Indicador</th><th>${safe(a.name)}</th><th>${safe(b.name)}</th></tr></thead><tbody>${comparisonLines()
        .map(
          ([label, read]) =>
            `<tr><td>${label}</td><td>${read(a)}</td><td>${read(b)}</td></tr>`,
        )
        .join(
          "",
        )}</tbody></table></div><p class="fine-print">Saldo positivo favorece Lula; negativo favorece Flávio. A variação de cada território compõe a variação do saldo nacional. Recortes que se sobrepõem não devem ser somados.</p>`;
    el("compare-sources").innerHTML =
      [a, b]
        .map(
          (r) =>
            `<p><b>${safe(r.name)}</b>${r.level === "region" ? " · soma de " + r.members.length + " municípios, calculada na plataforma." : ""}<br>${["1", "2"].map((t) => `<a href="${safe(r.level === "region" ? window.atlasData.states.find((s) => s.uf === "rj").turns[t].source : r.turns[t].source)}" target="_blank" rel="noopener">TSE · ${t}º turno${r.level === "region" ? " · resultado da UF para referência" : ""} ↗</a>`).join(" · ")}</p>`,
        )
        .join("") +
      groups()
        .map(
          (g) =>
            `<p>${safe(g.name)}: ${safe(g.definition)} <a href="${safe(g.source)}" target="_blank" rel="noopener">Definição ↗</a></p>`,
        )
        .join("") +
      '<p><a href="data/municipalities/rj.json" download>Base municipal usada nos recortes ↓</a></p>';
  }
  function csv(headers, rows, name) {
    const quote = (x) => '"' + String(x ?? "").replaceAll('"', '""') + '"';
    window.downloadAtlas(
      new Blob(
        [
          "\ufeff" +
            [headers, ...rows]
              .map((row) => row.map(quote).join(";"))
              .join("\n"),
        ],
        { type: "text/csv;charset=utf-8" },
      ),
      name,
    );
  }
  el("compare-a").onchange = renderComparison;
  el("compare-b").onchange = renderComparison;
  el("compare-swap").onclick = () => {
    const a = el("compare-a").value;
    el("compare-a").value = el("compare-b").value;
    el("compare-b").value = a;
    renderComparison();
  };
  el("compare-current").onclick = () => {
    if (window.atlasRecord) {
      catalog.set(id(window.atlasRecord), window.atlasRecord);
      buildCatalog();
      el("compare-a").value = id(window.atlasRecord);
      renderComparison();
    }
  };
  el("compare-csv").onclick = () => {
    const a = catalog.get(el("compare-a").value),
      b = catalog.get(el("compare-b").value);
    if (!a || !b) return;
    csv(
      ["Indicador", a.name, b.name],
      comparisonLines()
        .map(([label, read]) => [label, read(a), read(b)])
        .concat([
          ["Fonte TSE 1T", a.turns["1"].source, b.turns["1"].source],
          ["Fonte TSE 2T", a.turns["2"].source, b.turns["2"].source],
          [
            "Metodo",
            "Regioes sao somas municipais; recortes podem se sobrepor",
            "Saldo=Lula-Flavio; delta=2T-1T",
          ],
        ]),
      "comparacao-territorios.csv",
    );
  };
  async function navigateRegion(region) {
    if (!(await ready)) return;
    await window.navigateAtlas("rj");
    if (region !== "all") {
      const g = groups().find((g) => g.id === region);
      if (g) window.applyAtlasRegion(g);
    }
    renderRegions();
    el("atlas").scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }
  window.navigateAtlasRegion = navigateRegion;
  el("region-pills")
    .querySelectorAll("button")
    .forEach((btn) => (btn.onclick = () => navigateRegion(btn.dataset.region)));
  function renderRegions() {
    if (!context) return;
    const current = window.atlasRegion;
    el("region-pills")
      .querySelectorAll("button")
      .forEach((btn) =>
        btn.setAttribute(
          "aria-pressed",
          String(
            current
              ? btn.dataset.region === current.id
              : window.atlasRecord?.uf === "rj" && btn.dataset.region === "all",
          ),
        ),
      );
    el("region-definition").innerHTML = current
      ? `${safe(current.definition)} <a href="${safe(current.source)}" target="_blank" rel="noopener">Fonte da delimitação ↗</a> · ${current.members.length} municípios. Os recortes podem se sobrepor.`
      : "Capital: 1 município · Baixada: 13 · Região Metropolitana: 22 · Interior: 70 fora da região metropolitana. Baixada e Região Metropolitana se sobrepõem. Escolha um recorte para ver definição e fonte.";
  }
  function breadcrumbs() {
    const r = window.atlasRecord;
    if (!r) return;
    el("breadcrumbs").innerHTML =
      `<button data-crumb="br" ${r.uf === "br" ? 'aria-current="location"' : ""}>Brasil</button>${r.uf !== "br" ? `<span>›</span><button data-crumb="state">${safe(window.atlasData.states.find((s) => s.uf === r.uf)?.name || r.uf)}</button>` : ""}${window.atlasRegion ? `<span>›</span><button data-crumb="region">${safe(window.atlasRegion.name)}</button>` : ""}${r.level === "mu" ? `<span>›</span><span aria-current="location">${safe(r.name)}</span>` : ""}`;
    el("breadcrumbs")
      .querySelectorAll("button")
      .forEach(
        (btn) =>
          (btn.onclick = () =>
            btn.dataset.crumb === "br"
              ? window.navigateAtlas("br")
              : btn.dataset.crumb === "region"
                ? window.returnAtlasRegion()
                : window.navigateAtlas(r.uf)),
      );
  }
  async function runStory(key) {
    if (!(await ready)) return;
    story = key;
    el("map-candidate").value = key === "share" ? "22" : "13";
    el("map-metric").value =
      key === "margin" ? "margin" : key === "turnout" ? "turnout" : "pp";
    await window.navigateAtlas("rj");
    renderStory();
    window.setAtlasView?.(key === "margin" ? "weight" : "3d");
    el("story-detail").scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }
  document
    .querySelectorAll("[data-story]")
    .forEach((btn) => (btn.onclick = () => runStory(btn.dataset.story)));
  function renderStory() {
    if (!story) return;
    let list,
      title,
      text,
      label,
      read,
      unit = " votos";
    if (story === "share") {
      list = rj
        .filter((r) => {
          const c = A.candidate(r, "22");
          return c.d > 0 && c.p < 0;
        })
        .sort((a, b) => A.candidate(b, "22").d - A.candidate(a, "22").d);
      title = "Ganhar votos e perder participação é possível.";
      text = `No RJ, Flávio ganhou votos e reduziu a fatia dos válidos em ${list.length} municípios. O total de válidos também muda entre turnos. Isso não demonstra transferência individual ou irregularidade. Mapa: variação de Flávio em pontos percentuais.`;
      read = (r) => {
        const c = A.candidate(r, "22");
        return sign(c.d) + " votos · " + sign(c.p) + " p.p.";
      };
      label = "Ganho em votos / mudança na fatia";
    } else if (story === "margin") {
      list = rj
        .slice()
        .sort(
          (a, b) => Math.abs(A.marginChange(b)) - Math.abs(A.marginChange(a)),
        );
      title = "Onde o saldo entre os finalistas mais mudou?";
      text =
        "O saldo é Lula menos Flávio. A variação do saldo de cada município soma a variação do estado. Positivo favorece Lula; negativo favorece Flávio. Círculos mostram o volume de válidos do 2º turno; a cor mostra a mudança do saldo.";
      read = (r) => sign(A.marginChange(r)) + " votos";
      label = "Maior mudança absoluta no saldo";
    } else {
      list = rj
        .slice()
        .sort(
          (a, b) =>
            Math.abs(b.turns["2"].turnout - b.turns["1"].turnout) -
            Math.abs(a.turns["2"].turnout - a.turns["1"].turnout),
        );
      title = "Comparecimento: volume e taxa são medidas diferentes.";
      text =
        "O ranking mostra a maior mudança absoluta na quantidade de comparecimentos. Consulte também a taxa, calculada como comparecimento ÷ (comparecimento + abstenções) em cada turno. Mapa: mudança em quantidade.";
      read = (r) =>
        sign(r.turns["2"].turnout - r.turns["1"].turnout) +
        " comparecimentos · " +
        sign(rates(r.turns["2"]) - rates(r.turns["1"])) +
        " p.p.";
      label = "Maior mudança absoluta no comparecimento";
    }
    el("story-detail").hidden = false;
    el("story-detail").innerHTML =
      `<div class="story-head"><div><div class="panel-kicker">HISTÓRIA GUIADA / RJ / 1º → 2º TURNO</div><h3>${title}</h3></div><button id="story-close" aria-label="Fechar história">×</button></div><p>${text}</p><small>${label}</small><ol class="story-ranking">${list
        .slice(0, 5)
        .map(
          (r) =>
            `<li><button data-place="${r.code}"><span>${safe(r.name)}</span><b>${read(r)}</b></button></li>`,
        )
        .join(
          "",
        )}</ol><p class="fine-print">Fonte: TSE, arquivos dos dois turnos por município. Ranking com os 92 municípios. <a href="data/municipalities/rj.json" download>Conferir base ↓</a></p>`;
    el("story-close").onclick = () => {
      story = null;
      el("story-detail").hidden = true;
    };
    el("story-detail")
      .querySelectorAll("[data-place]")
      .forEach(
        (btn) =>
          (btn.onclick = async () => {
            await window.navigateAtlas("rj", btn.dataset.place);
            el("atlas").scrollIntoView({ behavior: "smooth" });
          }),
      );
    document
      .querySelectorAll("[data-story]")
      .forEach((btn) =>
        btn.setAttribute("aria-pressed", String(btn.dataset.story === story)),
      );
  }
  function selectedContextRows() {
    const codes =
      window.atlasRecord?.uf === "rj" && window.atlasFocusCodes
        ? new Set(window.atlasFocusCodes)
        : null;
    return rj.filter((r) => !codes || codes.has(String(r.ibge)));
  }
  function electoral(r, key) {
    const b = r.turns["2"];
    return key === "share13"
      ? (b.votes["13"] / b.valid) * 100
      : key === "share22"
        ? (b.votes["22"] / b.valid) * 100
        : key === "turnout"
          ? rates(b)
          : A.candidate(r, "13").p;
  }
  function renderContext() {
    if (!context || !rj.length) return;
    const indicator = el("context-indicator").value,
      meta = context.indicators[indicator],
      election = el("context-election").value,
      lookup = new Map(context.municipalities.map((r) => [String(r.ibge), r]));
    const items = selectedContextRows();
    contextRows = items
      .map((r) => ({
        r,
        context: lookup.get(String(r.ibge)),
        x: lookup.get(String(r.ibge))?.values[indicator],
        y: electoral(r, election),
      }))
      .filter(
        (p) =>
          p.x != null &&
          p.y != null &&
          Number.isFinite(p.x) &&
          Number.isFinite(p.y),
      );
    const label =
        meta?.label || el("context-indicator").selectedOptions[0].text,
      unit = meta?.unit || "";
    el("context-description").textContent =
      `${contextRows.length}/${items.length} municípios com as duas medidas · Censo ${meta?.year || 2022} × TSE 2026 · ${window.atlasRecord?.uf === "rj" && window.atlasRegion ? window.atlasRegion.name : "Estado do Rio de Janeiro"}.`;
    const source = meta?.source || meta?.sourceUrl;
    el("context-source").innerHTML =
      `${safe(label)} · ${safe(meta?.year || 2022)} · ${safe(unit)}. ${safe(meta?.denominator || "")} ${source ? `<a href="${safe(source)}" target="_blank" rel="noopener">Fonte IBGE / consulta ↗</a>` : ""}`;
    el("context-table-indicator").textContent = label;
    el("context-table-election").textContent =
      el("context-election").selectedOptions[0].text;
    el("context-table").innerHTML = contextRows
      .map(
        (p) =>
          `<tr><td><button data-place="${p.r.code}">${safe(p.r.name)}</button></td><td>${f(p.x)} ${safe(unit)}</td><td>${f(p.y)} ${election === "change13" ? "p.p." : "%"}</td></tr>`,
      )
      .join("");
    el("context-table")
      .querySelectorAll("[data-place]")
      .forEach(
        (btn) =>
          (btn.onclick = () => window.navigateAtlas("rj", btn.dataset.place)),
      );
    contextExport = contextRows.map((p) => [
      p.r.name,
      p.r.ibge,
      p.x,
      meta?.year || 2022,
      p.y,
      2026,
      source,
      p.r.turns["2"].source,
    ]);
    drawScatter();
    renderContextCards(lookup.get(String(window.atlasRecord?.ibge)), meta);
  }
  function renderContextCards(selected) {
    const r = window.atlasRecord,
      match = r?.uf === "rj" && r.level === "mu" ? selected : null;
    if (!match) {
      el("context-cards").innerHTML =
        '<p class="fine-print">Selecione um município do RJ no mapa ou em um ponto para consultar seu perfil do Censo.</p>';
      return;
    }
    el("context-cards").innerHTML = ["population", "literacy", "medianAge"]
      .map((key) => {
        const m = context.indicators[key];
        return `<div><small>${safe(m.label)} · ${m.year}</small><strong>${f(match.values[key])} <span>${safe(m.unit)}</span></strong></div>`;
      })
      .join("");
  }
  function drawScatter() {
    if (!context) return;
    const svg = d3.select(el("context-chart")),
      width = Math.max(300, el("context-chart").clientWidth),
      height = 350,
      margin = { left: 64, right: 30, top: 22, bottom: 60 };
    svg.attr("viewBox", `0 0 ${width} ${height}`);
    svg.selectAll("*").remove();
    const logarithmic = el("context-log").checked,
      points = contextRows.filter((p) => !logarithmic || p.x > 0);
    if (!points.length) {
      svg
        .append("text")
        .attr("x", 20)
        .attr("y", 70)
        .attr("fill", "#9eb4c0")
        .text("Sem dados comparáveis neste recorte.");
      return;
    }
    let [xmin, xmax] = d3.extent(points, (p) => p.x);
    if (xmin === xmax) {
      xmin = Math.max(logarithmic ? 0.1 : 0, xmin * 0.9);
      xmax = xmax * 1.1 || 1;
    }
    const x = (logarithmic ? d3.scaleLog() : d3.scaleLinear())
      .domain([xmin, xmax])
      .nice()
      .range([margin.left, width - margin.right]);
    const change = el("context-election").value === "change13",
      extent = d3.extent(points, (p) => p.y),
      y = d3
        .scaleLinear()
        .domain(
          change
            ? [Math.min(0, extent[0]) - 1, Math.max(0, extent[1]) + 1]
            : [0, 100],
        )
        .nice()
        .range([height - margin.bottom, margin.top]);
    const axis = svg
      .append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).ticks(width < 500 ? 4 : 7, "~s"));
    axis.selectAll("text").attr("fill", "#9cb2bf").attr("font-size", 10);
    svg
      .append("g")
      .attr("transform", `translate(${margin.left},0)`)
      .call(
        d3
          .axisLeft(y)
          .ticks(5)
          .tickFormat((v) => f(v) + (change ? "" : "%")),
      )
      .selectAll("text")
      .attr("fill", "#9cb2bf")
      .attr("font-size", 10);
    svg.selectAll(".domain,.tick line").attr("stroke", "#344d59");
    svg
      .append("g")
      .selectAll("line")
      .data(y.ticks(5))
      .join("line")
      .attr("x1", margin.left)
      .attr("x2", width - margin.right)
      .attr("y1", y)
      .attr("y2", y)
      .attr("stroke", "#253b47")
      .attr("stroke-dasharray", "2 5");
    const selected = window.atlasRecord?.code;
    function detail(p) {
      el("context-hover").textContent =
        `${p.r.name} · ${el("context-indicator").selectedOptions[0].text}: ${f(p.x)} ${context.indicators[el("context-indicator").value]?.unit || ""} · ${el("context-election").selectedOptions[0].text}: ${f(p.y)}${change ? " p.p." : "%"}`;
    }
    svg
      .append("g")
      .selectAll("circle")
      .data(points)
      .join("circle")
      .attr("cx", (p) => x(p.x))
      .attr("cy", (p) => y(p.y))
      .attr("r", (p) => (p.r.code === selected ? 6 : 4))
      .attr("fill", (p) => (p.r.code === selected ? "#ffffff" : "#77dfc1"))
      .attr("fill-opacity", 0.7)
      .attr("stroke", "#0e2029")
      .attr("stroke-width", 1)
      .attr("tabindex", 0)
      .attr("role", "button")
      .attr(
        "aria-label",
        (p) => `${p.r.name}: ${f(p.x)}; resultado ${f(p.y)}. Abrir município.`,
      )
      .on("pointerenter", (_, p) => detail(p))
      .on("focus", (_, p) => detail(p))
      .on("click", (_, p) => window.navigateAtlas("rj", p.r.code))
      .on("keydown", (e, p) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          window.navigateAtlas("rj", p.r.code);
        }
      });
    svg
      .append("text")
      .attr("x", margin.left)
      .attr("y", height - 13)
      .attr("fill", "#91a9b6")
      .attr("font-size", 10)
      .text(
        el("context-indicator").selectedOptions[0].text +
          " (" +
          context.indicators[el("context-indicator").value].unit +
          ")" +
          (logarithmic ? " · escala logarítmica" : ""),
      );
    const correlation = A.correlation(
      points.map((p) => [logarithmic ? Math.log10(p.x) : p.x, p.y]),
    );
    el("context-hover").textContent =
      `${points.length} municípios · r de Pearson${logarithmic ? " sobre log10 do indicador" : ""}: ${correlation == null ? "não calculável" : f(correlation)}. Passe o cursor ou use Tab para consultar. A correlação é descritiva.`;
  }
  el("context-indicator").onchange = () => {
    el("context-log").checked = ["population", "density"].includes(
      el("context-indicator").value,
    );
    renderContext();
  };
  el("context-election").onchange = renderContext;
  el("context-log").onchange = drawScatter;
  el("context-log").checked = true;
  new ResizeObserver(() => {
    if (context) drawScatter();
  }).observe(el("context-chart"));
  el("context-csv").onclick = () =>
    csv(
      [
        "Municipio",
        "IBGE",
        el("context-indicator").selectedOptions[0].text,
        "Ano_contexto",
        el("context-election").selectedOptions[0].text,
        "Ano_eleicao",
        "Fonte_IBGE",
        "Fonte_TSE",
      ],
      contextExport,
      "contexto-eleitoral-rj.csv",
    );
  function refresh() {
    breadcrumbs();
    if (!context || !window.atlasData) return;
    buildCatalog();
    renderRegions();
    renderContext();
  }
  window.addEventListener("atlas:record", refresh);
  let initialized = false;
  async function initializeQuery() {
    if (initialized || !window.atlasLoaded) return;
    initialized = true;
    if (!(await ready)) return;
    const params = window.atlasInitialParameters || {};
    if (params.regiao && groups().some((g) => g.id === params.regiao)) {
      await window.navigateAtlas("rj");
      window.applyAtlasRegion(groups().find((g) => g.id === params.regiao));
      if (params.municipio) {
        const r = rj.find(
          (r) =>
            r.code === params.municipio &&
            window.atlasFocusCodes.includes(String(r.ibge)),
        );
        if (r) window.chooseAtlasRecord(r);
      }
    }
    if (["2d", "weight", "local"].includes(params.visao)) {
      window.pendingAtlasView = params.visao;
      window.setAtlasView?.(params.visao);
    }
    refresh();
  }
  window.addEventListener("atlas:ready", initializeQuery);
  ready.then(initializeQuery);
  if (window.atlasRecord) refresh();
})();
