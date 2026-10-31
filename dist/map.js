(() => {
  let selectedRecord = null,
    version = 0,
    geoCache = new Map(),
    rowCache = new Map(),
    redraw = null;
  const el = (id) => document.getElementById(id),
    nf = (n) =>
      new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(n);
  async function get(path, cache) {
    if (!cache.has(path))
      cache.set(
        path,
        fetch(path).then((r) => {
          if (!r.ok) throw Error("Não foi possível carregar a cartografia");
          return r.json();
        }),
      );
    return cache.get(path);
  }
  function measure(r) {
    if (el("map-metric").value === "margin")
      return VoteAnalytics.marginChange(r);
    if (el("map-metric").value === "turnout")
      return r.turns["2"].turnout - r.turns["1"].turnout;
    const n = el("map-candidate").value,
      a = r.turns["1"],
      b = r.turns["2"];
    if (!a || !b) return null;
    const metric = el("map-metric").value,
      x = a.votes[n],
      y = b.votes[n];
    if (x == null || y == null) return null;
    return metric === "delta"
      ? y - x
      : metric === "pp"
        ? (y / b.valid - x / a.valid) * 100
        : metric === "votes"
          ? y
          : (y / b.valid) * 100;
  }
  function unit() {
    return el("map-metric").value === "pp"
      ? " p.p."
      : el("map-metric").value === "share"
        ? "%"
        : el("map-metric").value === "turnout"
          ? " comparecimentos"
          : " votos";
  }
  function value(v) {
    return v == null
      ? "Sem dado comparável"
      : ((el("map-metric").value === "delta" ||
          ["pp", "margin", "turnout"].includes(el("map-metric").value)) &&
        v > 0
          ? "+"
          : "") +
          nf(v) +
          unit();
  }
  window.drawElectionMap = async function (record) {
    selectedRecord = record;
    if (
      window.atlasMode === "local" &&
      record.uf === "rj" &&
      record.level === "mu" &&
      window.drawPollingMap
    ) {
      await window.drawPollingMap(record);
      return;
    }
    const ticket = ++version,
      uf = record.uf,
      municipalView = uf !== "br" && uf !== "zz";
    if (uf === "zz") {
      d3.select(el("election-map")).selectAll("*").remove();
      el("map-title").textContent = "Exterior · sem geometria";
      el("map-loading").textContent =
        "Exterior disponível nas tabelas; não representado no mapa.";
      el("map-min").textContent = "";
      el("map-max").textContent = "";
      el("map-detail").textContent =
        "Escolha uma localidade do exterior no filtro ou na tabela.";
      return;
    }
    el("map-loading").textContent = "Carregando cartografia…";
    try {
      const [geo, records] = await Promise.all([
        get(
          municipalView
            ? `data/geometry/${uf}.json`
            : "data/geometry/states.json",
          geoCache,
        ),
        municipalView
          ? get(`data/municipalities/${uf}.json`, rowCache)
          : Promise.resolve(data.states.filter((x) => x.uf !== "zz")),
      ]);
      if (ticket !== version) return;
      const byId = new Map(
        records.map((r) => [
          municipalView ? String(r.ibge) : r.uf.toUpperCase(),
          r,
        ]),
      );
      let features = geo.features.map((f) => ({
        feature: f,
        record: byId.get(
          municipalView ? String(f.properties.id) : f.properties.sigla,
        ),
      }));
      if (window.atlasFocusCodes && uf === "rj")
        features = features.filter((x) =>
          window.atlasFocusCodes.includes(String(x.record?.ibge)),
        );
      const scopeGeo = {
        type: "FeatureCollection",
        features: features.map((x) => x.feature),
      };
      const mapped = new Set(
        features
          .filter((x) => x.record)
          .map((x) => (municipalView ? x.record.code : x.record.uf)),
      );
      el("map-title").textContent = municipalView
        ? `${record.level === "mu" ? data.states.find((s) => s.uf === uf).name : record.name} · municípios`
        : "Brasil · estados";
      el("map-loading").textContent =
        `${mapped.size} de ${window.atlasFocusCodes?.length || records.length} territórios com geometria correspondente${uf === "zz" ? " · Exterior disponível nas tabelas" : ""}.`;
      const container = el("map-drawing");
      redraw = () => {
        const width = container.clientWidth || 700,
          height = Math.max(250, container.clientHeight - 170);
        const svg = d3
          .select(el("election-map"))
          .attr("viewBox", `0 0 ${width} ${height}`)
          .attr("height", height);
        svg.selectAll("*").remove();
        const projection = d3.geoMercator().fitExtent(
            [
              [18, 18],
              [width - 18, height - 18],
            ],
            scopeGeo,
          ),
          path = d3.geoPath(projection);
        const group = svg.append("g"),
          weighted = window.atlasMode === "weight";
        const vals = features
          .map((x) => (x.record ? measure(x.record) : null))
          .filter((v) => v != null && Number.isFinite(v));
        const diverging = ["delta", "pp", "margin", "turnout"].includes(
            el("map-metric").value,
          ),
          max = AtlasScale.max(window.atlasScaleDomains, el("scale-fixed").checked,
            municipalView ? "mu" : "uf", el("map-metric").value,
            el("map-candidate").value, vals);
        const scale = diverging
          ? d3
              .scaleLinear()
              .domain([-max, 0, max])
              .range(["#ed967f", "#314650", "#77dfc1"])
              .clamp(true)
          : d3
              .scaleLinear()
              .domain([0, max])
              .range(["#203b47", "#77dfc1"])
              .clamp(true);
        function detail(item) {
          if (!item.record) {
            el("map-detail").textContent =
              (item.feature.properties.name ||
                item.feature.properties.description ||
                "Território") + " · sem correspondência nos dados";
            return;
          }
          const r = item.record;
          el("map-detail").textContent =
            `${r.name} · ${el("map-metric").selectedOptions[0].text}: ${value(measure(r))} · ${nf(r.turns["2"].votes[el("map-candidate").value])} votos no 2º turno`;
        }
        async function choose(item) {
          if (!item.record) return;
          const r = item.record;
          if (!municipalView) {
            el("uf").value = r.uf;
            await loadState();
          } else {
            el("mun").value = r.code;
            render(r);
          }
        }
        group
          .selectAll("path")
          .data(features)
          .join("path")
          .attr("d", (d) => path(d.feature))
          .attr("fill", (d) => {
            const v = d.record ? measure(d.record) : null;
            return weighted
              ? "#182c37"
              : v == null || !Number.isFinite(v)
                ? "#ccd2ce"
                : scale(v);
          })
          .attr("stroke", (d) =>
            d.record?.code === record.code && record.level === "mu"
              ? "#ffffff"
              : "#63878d",
          )
          .attr("stroke-width", (d) =>
            d.record?.code === record.code && record.level === "mu"
              ? 2.5
              : 0.65,
          )
          .attr("vector-effect", "non-scaling-stroke")
          .attr("tabindex", 0)
          .attr("role", "button")
          .attr("aria-label", (d) =>
            d.record
              ? `${d.record.name}: ${value(measure(d.record))}. Abrir resultados.`
              : "Sem correspondência",
          )
          .on("pointerenter", (_, d) => detail(d))
          .on("focus", (_, d) => detail(d))
          .on("click", (_, d) => choose(d))
          .on("keydown", (event, d) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              choose(d);
            }
          });
        if (weighted) {
          const largest =
            d3.max(features, (x) => x.record?.turns["2"].valid || 0) || 1;
          const radius = d3
            .scaleSqrt()
            .domain([0, largest])
            .range([0, Math.min(width, height) * 0.095]);
          group
            .append("g")
            .selectAll("circle")
            .data(features.filter((x) => x.record))
            .join("circle")
            .attr("cx", (d) => path.centroid(d.feature)[0])
            .attr("cy", (d) => path.centroid(d.feature)[1])
            .attr("r", (d) => radius(d.record.turns["2"].valid))
            .attr("fill", (d) => scale(measure(d.record)))
            .attr("fill-opacity", 0.75)
            .attr("stroke", "#d3fff1")
            .attr("stroke-width", 0.7)
            .attr("vector-effect", "non-scaling-stroke")
            .attr("role", "button")
            .attr("tabindex", 0)
            .attr(
              "aria-label",
              (d) =>
                `${d.record.name}: ${nf(d.record.turns["2"].valid)} votos válidos; ${value(measure(d.record))}. Abrir resultados.`,
            )
            .on("pointerenter", (_, d) => detail(d))
            .on("focus", (_, d) => detail(d))
            .on("click", (_, d) => choose(d))
            .on("keydown", (e, d) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                choose(d);
              }
            });
          el("height-caption").textContent =
            `Área do círculo = válidos no 2º turno · maior: ${nf(largest)} votos. Cor = indicador. Centros geográficos, sem localização de eleitores.`;
        }
        if (!municipalView) {
          group
            .selectAll("text")
            .data(features)
            .join("text")
            .attr("transform", (d) => `translate(${path.centroid(d.feature)})`)
            .attr("text-anchor", "middle")
            .attr("dy", ".35em")
            .attr("font-size", 11)
            .attr("fill", "#e8ffff")
            .attr("paint-order", "stroke")
            .attr("stroke", "#11222c")
            .attr("stroke-width", 2)
            .attr("pointer-events", "none")
            .text((d) => d.feature.properties.sigla);
        }
        const zoom = d3
          .zoom()
          .scaleExtent([1, 12])
          .filter((e) => e.type !== "wheel" || e.ctrlKey)
          .on("zoom", (e) => group.attr("transform", e.transform));
        svg.call(zoom);
        if (record.level === "mu") {
          const feature = features.find((x) => x.record?.code === record.code);
          if (feature) {
            const bounds = path.bounds(feature.feature),
              dx = bounds[1][0] - bounds[0][0],
              dy = bounds[1][1] - bounds[0][1],
              k = Math.min(6, 0.65 / Math.max(dx / width, dy / height));
            const x = (bounds[0][0] + bounds[1][0]) / 2,
              y = (bounds[0][1] + bounds[1][1]) / 2;
            svg.call(
              zoom.transform,
              d3.zoomIdentity
                .translate(width / 2, height / 2)
                .scale(Math.max(1, k))
                .translate(-x, -y),
            );
          }
        }

        if (el("map-drawing").hidden) return;
        el("map-plus").onclick = () => svg.call(zoom.scaleBy, 1.5);
        el("map-minus").onclick = () => svg.call(zoom.scaleBy, 1 / 1.5);
        el("map-reset").onclick = () =>
          svg.call(zoom.transform, d3.zoomIdentity);
        el("map-legend-bar").style.background = diverging
          ? "linear-gradient(90deg,#ed967f,#314650,#77dfc1)"
          : "linear-gradient(90deg,#203b47,#77dfc1)";
        el("map-min").textContent = value(diverging ? -max : 0);
        el("map-max").textContent = value(max);
        el("scale-caption").textContent = el("scale-fixed").checked
          ? `Escala fixa · ${municipalView ? "municípios do Brasil" : "27 UFs"} · mesma régua para este indicador`
          : "Escala dinâmica · recorte atual";
        el("map-detail").textContent =
          municipalView && record.level === "mu"
            ? `${record.name} · ${value(measure(record))}`
            : "Toque em uma área para abrir os resultados; passe o cursor para consultar os valores.";
      };
      if (!container.hidden) redraw();
    } catch (error) {
      if (ticket === version) el("map-loading").textContent = error.message;
    }
  };
  for (const id of ["map-candidate", "map-metric"])
    el(id).addEventListener(
      "change",
      () => selectedRecord && window.drawElectionMap(selectedRecord),
    );
  el("map-brasil").onclick = () => {
    el("uf").value = "br";
    loadState();
  };
  let timer;
  new ResizeObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (el("map-drawing").hidden) return;
      if (window.atlasMode === "local") window.drawPollingMap?.(selectedRecord);
      else if (redraw) redraw();
    }, 120);
  }).observe(el("map-drawing"));
})();
