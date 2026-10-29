/* Actual polling locations. Data is admitted only after municipal reconciliation. */
(() => {
  const el = (id) => document.getElementById(id),
    f = (n) =>
      n == null
        ? "—"
        : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(
            n,
          ),
    safe = (s) =>
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
  let source = null,
    placesPromise = null,
    geoPromise = null,
    municipalities = [],
    currentRecord = null,
    currentGeometry = null,
    selectedPlace = null,
    drawVersion = 0;
  function load() {
    if (!placesPromise)
      placesPromise = fetch("data/polling-places-rj.json")
        .then((r) => {
          if (!r.ok) throw Error("Base de locais ainda não disponível.");
          return r.json();
        })
        .then((d) => ((source = d), d))
        .catch((e) => {
          placesPromise = null;
          throw e;
        });
    return placesPromise;
  }
  fetch("data/municipalities/rj.json")
    .then((r) => r.json())
    .then((rows) => {
      municipalities = rows;
      for (const r of rows) {
        const o = document.createElement("option");
        o.value = r.code;
        o.textContent = r.name;
        el("polling-municipality").append(o);
      }
    })
    .catch(
      () => (el("polling-status").textContent = "Base municipal indisponível."),
    );
  function measure(p) {
    const a = p.turns["1"],
      b = p.turns["2"],
      n = el("map-candidate").value,
      k = el("map-metric").value;
    if (k === "votes") return b?.votes[n] ?? null;
    if (k === "share")
      return b?.valid > 0 ? ((b.votes[n] || 0) / b.valid) * 100 : null;
    if (!a || !b) return null;
    if (k === "margin")
      return (
        (b.votes["13"] || 0) -
        (b.votes["22"] || 0) -
        ((a.votes["13"] || 0) - (a.votes["22"] || 0))
      );
    if (k === "pp")
      return a.valid > 0 && b.valid > 0
        ? ((b.votes[n] || 0) / b.valid - (a.votes[n] || 0) / a.valid) * 100
        : null;
    return (b.votes[n] || 0) - (a.votes[n] || 0);
  }
  function value(v) {
    if (v == null || !Number.isFinite(v)) return "Sem dado comparável";
    const k = el("map-metric").value;
    return (
      (["delta", "pp", "margin"].includes(k) && v > 0 ? "+" : "") +
      f(v) +
      (k === "pp" ? " p.p." : k === "share" ? "%" : " votos")
    );
  }
  function coordinate(p) {
    const t = p.turns["2"];
    const point =
      t &&
      Number.isFinite(t.lat) &&
      Number.isFinite(t.lon) &&
      t.lat >= -24 &&
      t.lat <= -20 &&
      t.lon >= -45 &&
      t.lon <= -40
        ? [t.lon, t.lat]
        : null;
    return point && (!currentGeometry || d3.geoContains(currentGeometry, point))
      ? point
      : null;
  }
  function listFor(r) {
    return source.places.filter(
      (p) => String(p.municipalityCode) === String(r.code),
    );
  }
  function inspect(p) {
    selectedPlace = p;
    el("local-inspector").hidden = false;
    const a = p.turns["1"],
      b = p.turns["2"];
    const moved =
      a && b && (a.address !== b.address || a.lat !== b.lat || a.lon !== b.lon);
    el("local-inspector").innerHTML =
      `<div class="eyebrow">LOCAL SELECIONADO</div><h3>${safe(b?.name || a?.name || p.name)}</h3><p>${safe(b?.address || a?.address || p.address)}<br>Zona ${safe(p.zone)} · local ${safe(p.localCode)}</p><strong>${value(measure(p))}</strong><div class="scroll"><table><thead><tr><th>Votos</th><th>1º</th><th>2º</th></tr></thead><tbody>${[
        ["Lula", "13"],
        ["Flávio", "22"],
      ]
        .map(
          ([name, n]) =>
            `<tr><td>${name}</td><td>${f(a?.votes[n])}</td><td>${f(b?.votes[n])}</td></tr>`,
        )
        .join(
          "",
        )}<tr><td>Válidos</td><td>${f(a?.valid)}</td><td>${f(b?.valid)}</td></tr></tbody></table></div>${moved ? '<p class="fine-print">Endereço ou coordenadas diferem entre os turnos. Ponto no mapa: cadastro do 2º turno. Correspondência por município, zona e número do local.</p>' : ""}<p class="fine-print">Totais do local. O painel principal mantém o resultado do município.</p>`;
    const detail = document.createElement("details");
    const title = document.createElement("summary");
    title.textContent = "Todos os candidatos neste local";
    detail.append(title);
    const wrap = document.createElement("div");
    wrap.className = "scroll";
    wrap.innerHTML =
      "<table><thead><tr><th>Candidato</th><th>1º</th><th>2º</th></tr></thead><tbody>" +
      Object.entries(window.atlasData.candidates)
        .map(
          ([n, c]) =>
            "<tr><td>" +
            safe(c.name) +
            "</td><td>" +
            f(a?.votes[n]) +
            "</td><td>" +
            (b?.votes[n] == null ? "Não disputou" : f(b.votes[n])) +
            "</td></tr>",
        )
        .join("") +
      [
        ["Brancos", "blank"],
        ["Nulos", "null"],
      ]
        .map(
          ([label, k]) =>
            "<tr><td>" +
            label +
            "</td><td>" +
            f(a?.[k]) +
            "</td><td>" +
            f(b?.[k]) +
            "</td></tr>",
        )
        .join("") +
      "</tbody></table>";
    detail.append(wrap);
    el("local-inspector").append(detail);
    el("map-detail").textContent =
      (b?.name || a?.name || p.name) + " · " + value(measure(p));
  }
  function table(records) {
    el("polling-table").innerHTML = records
      .map(
        (p, i) =>
          `<tr><td><button data-index="${i}">${safe(p.turns["2"]?.name || p.name)} · zona ${safe(p.zone)} · ${safe(p.localCode)}</button></td><td>${f(p.turns["1"]?.valid)}</td><td>${f(p.turns["2"]?.valid)}</td><td>${coordinate(p) ? "Ponto no 2º turno" : "Sem ponto dentro do município"}</td></tr>`,
      )
      .join("");
    el("polling-table")
      .querySelectorAll("button")
      .forEach(
        (btn) =>
          (btn.onclick = () => inspect(records[Number(btn.dataset.index)])),
      );
  }
  window.drawPollingMap = async function (record) {
    const ticket = ++drawVersion;
    currentRecord = record;
    el("map-loading").textContent = "Carregando resultados por local…";
    try {
      await load();
      if (!geoPromise)
        geoPromise = fetch("data/geometry/rj.json").then((r) => r.json());
      const geo = await geoPromise;
      if (ticket !== drawVersion || window.atlasMode !== "local") return;
      const features = geo.features.filter(
        (f) => String(f.properties.id) === String(record.ibge),
      );
      if (!features.length) throw Error("Limite municipal indisponível");
      const municipalityGeo = { type: "FeatureCollection", features };
      currentGeometry = municipalityGeo;
      const places = listFor(record),
        mapped = places.filter((p) => coordinate(p)),
        container = el("map-drawing"),
        w = container.clientWidth || 700,
        h = Math.max(260, container.clientHeight - 170),
        svg = d3
          .select(el("election-map"))
          .attr("viewBox", `0 0 ${w} ${h}`)
          .attr("width", w)
          .attr("height", h);
      svg.selectAll("*").remove();
      const projection = d3.geoMercator().fitExtent(
          [
            [20, 20],
            [w - 20, h - 20],
          ],
          municipalityGeo,
        ),
        path = d3.geoPath(projection),
        g = svg.append("g");
      g.selectAll("path")
        .data(features)
        .join("path")
        .attr("d", path)
        .attr("fill", "#17303c")
        .attr("stroke", "#6a9198")
        .attr("stroke-width", 1)
        .attr("vector-effect", "non-scaling-stroke");
      const vals = mapped
          .map(measure)
          .filter((v) => v != null && Number.isFinite(v)),
        max = Math.max(1, ...vals.map(Math.abs)),
        diverging = ["delta", "pp", "margin"].includes(el("map-metric").value),
        scale = d3
          .scaleLinear()
          .domain(diverging ? [-max, 0, max] : [0, max])
          .range(
            diverging
              ? ["#ed967f", "#314650", "#77dfc1"]
              : ["#203b47", "#77dfc1"],
          )
          .clamp(true);
      g.selectAll("circle")
        .data(mapped)
        .join("circle")
        .attr("cx", (p) => projection(coordinate(p))[0])
        .attr("cy", (p) => projection(coordinate(p))[1])
        .attr("r", 4.5)
        .attr("fill", (p) =>
          measure(p) == null ? "#78868e" : scale(measure(p)),
        )
        .attr("stroke", "#defff2")
        .attr("stroke-width", 0.6)
        .attr("fill-opacity", 0.85)
        .attr("vector-effect", "non-scaling-stroke")
        .attr("role", "button")
        .attr("tabindex", 0)
        .attr(
          "aria-label",
          (p) =>
            (p.turns["2"]?.name || p.name) +
            ", zona " +
            p.zone +
            ", local " +
            p.localCode +
            ": " +
            value(measure(p)) +
            ". Consultar local.",
        )
        .on(
          "pointerenter",
          (_, p) =>
            (el("map-detail").textContent =
              (p.turns["2"]?.name || p.name) + " · " + value(measure(p))),
        )
        .on("focus", (_, p) => inspect(p))
        .on("click", (_, p) => inspect(p))
        .on("keydown", (e, p) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inspect(p);
          }
        });
      const zoom = d3
        .zoom()
        .scaleExtent([1, 20])
        .filter((e) => e.type !== "wheel" || e.ctrlKey)
        .on("zoom", (e) => g.attr("transform", e.transform));
      svg.call(zoom);
      el("map-plus").onclick = () => svg.call(zoom.scaleBy, 1.5);
      el("map-minus").onclick = () => svg.call(zoom.scaleBy, 1 / 1.5);
      el("map-reset").onclick = () => svg.call(zoom.transform, d3.zoomIdentity);
      el("map-title").textContent = record.name + " · locais de votação";
      el("map-min").textContent = value(diverging ? -max : 0);
      el("map-max").textContent = value(max);
      el("map-legend-bar").style.background = diverging
        ? "linear-gradient(90deg,#ed967f,#314650,#77dfc1)"
        : "linear-gradient(90deg,#203b47,#77dfc1)";
      el("height-caption").textContent =
        "Cada ponto = um local no cadastro do 2º turno · tamanho fixo · cor = indicador. Pontos podem se sobrepor; use zoom ou selecione o local na tabela.";
      el("map-loading").textContent =
        `${mapped.length}/${places.length} locais com ponto no 2º turno · sem ponto: ${places.length - mapped.length}`;
      el("polling-status").textContent =
        record.name +
        ": " +
        mapped.length +
        " de " +
        places.length +
        " locais com coordenadas dentro do limite municipal no 2º turno. Locais sem ponto ou sem um dos turnos permanecem na tabela. Resultados conferidos por soma municipal.";
      el("polling-status").insertAdjacentHTML(
        "beforeend",
        ' <a href="https://dadosabertos.tse.jus.br/dataset/resultados-2026" target="_blank" rel="noopener">Fonte de resultados TSE ↗</a> · <a href="data/polling-places-rj.json" download>Base auditada de locais ↓</a>',
      );
      table(places);
      if (selectedPlace && places.some((p) => p.id === selectedPlace.id))
        inspect(places.find((p) => p.id === selectedPlace.id));
      else {
        el("local-inspector").hidden = true;
        el("map-detail").textContent =
          "Selecione um ponto ou um local na tabela para consultar seus resultados.";
      }
    } catch (e) {
      el("map-loading").textContent = e.message;
      el("polling-status").textContent = e.message;
    }
  };
  el("polling-open").onclick = async () => {
    const code = el("polling-municipality").value;
    if (!code) {
      el("polling-status").textContent =
        "Selecione um município antes de abrir o mapa.";
      return;
    }
    el("polling-open").disabled = true;
    try {
      await load();
      await window.navigateAtlas("rj", code);
      if (el("map-metric").value === "turnout") {
        el("map-metric").value = "delta";
        el("map-metric").dispatchEvent(new Event("change"));
      }
      window.setAtlasView("local");
      el("atlas").scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    } catch (e) {
      el("polling-status").textContent = e.message;
    } finally {
      el("polling-open").disabled = false;
    }
  };
  function refresh() {
    const r = window.atlasRecord;
    el("view-local").hidden = !(r?.uf === "rj" && r.level === "mu");
    if (r?.uf === "rj" && r.level === "mu")
      el("polling-municipality").value = r.code;
    if (window.atlasMode === "local" && !(r?.uf === "rj" && r.level === "mu"))
      window.setAtlasView?.("3d");
    const option = el("map-metric").querySelector('[value="turnout"]');
    option.disabled = window.atlasMode === "local";
    if (window.atlasMode === "local" && el("map-metric").value === "turnout") {
      el("map-metric").value = "delta";
      el("map-metric").dispatchEvent(new Event("change"));
    }
  }
  window.addEventListener("atlas:record", refresh);
  window.addEventListener("atlas:view", refresh);
  window.addEventListener("resize", () => {
    if (window.atlasMode === "local" && currentRecord)
      window.drawPollingMap(currentRecord);
  });
})();
