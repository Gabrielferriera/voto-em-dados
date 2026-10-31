/* An editorial story whose displayed figures are derived from the committed snapshots. */
(() => {
  const el = (id) => document.getElementById(id);
  const fmt = (v, digits = 0) => new Intl.NumberFormat("pt-BR",
    { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
  const signed = (v) => (v > 0 ? "+" : "") + fmt(v);
  const esc = (v) => String(v).replace(/[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  let story;
  const sources = ["data/context-rj.json", "data/municipalities/rj.json", "data/geometry/rj.json", "data/overview.json"];
  Promise.all(sources.map(async (path) => {
    const response = await fetch(path);
    if (!response.ok) throw Error("Não foi possível conferir as bases da história");
    return response.json();
  })).then(([context, municipalities, geometry, overview]) => {
    story = BaixadaStoryModel.build(context, municipalities);
    render(story, geometry, overview);
  }).catch(() => {
    el("baixada-summary").innerHTML = "<p>Esta história está temporariamente indisponível. A base municipal e as fontes continuam acessíveis no atlas.</p>";
  });

  function openPlace(record) {
    if (!window.navigateAtlas) return;
    window.navigateAtlas("rj", record.code).then(() => {
      const url = new URL(location.href);
      url.hash = "atlas";
      history.replaceState(null, "", url);
      el("atlas").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    });
  }
  function render(s, geometry, overview) {
    const first = s.totals["1"], second = s.totals["2"];
    el("baixada-summary").innerHTML = `
      <div class="baixada-lead"><small>O SALDO ENTRE FINALISTAS MUDOU</small><strong>${signed(s.marginChange)}</strong><span>votos em direção a Lula entre os turnos. Flávio ainda liderou o segundo turno no recorte por ${fmt(Math.abs(s.balance2))} votos.</span></div>
      <div class="baixada-stat"><small>LULA</small><strong>${signed(s.lulaGain)}</strong><span>${fmt(first.lula)} → ${fmt(second.lula)} votos</span></div>
      <div class="baixada-stat"><small>FLÁVIO</small><strong>${signed(s.flavioGain)}</strong><span>${fmt(first.flavio)} → ${fmt(second.flavio)} votos</span></div>
      <div class="baixada-stat"><small>COMPARECIMENTO</small><strong>${signed(s.turnoutChange)}</strong><span>${fmt(first.turnout)} → ${fmt(second.turnout)} pessoas</span></div>`;
    const japeri = s.places.find((p) => p.record.ibge === "3302270");
    el("baixada-reading").innerHTML =
      `A vantagem de Flávio passou de <strong>${fmt(Math.abs(s.balance1))}</strong> para <strong>${fmt(Math.abs(s.balance2))}</strong> votos. O ganho de Lula no recorte foi maior que o de Flávio, e a mudança do saldo é a diferença entre esses dois ganhos: <strong>${signed(s.marginChange)} votos</strong>. Em Japeri, o comparecimento mudou <strong>${signed(japeri.turnout)} pessoas</strong>, enquanto o saldo mudou <strong>${signed(japeri.margin)} votos</strong>. O contraste mostra por que não se pode atribuir a mudança a um único fluxo de eleitores.`;
    const state = overview.states.find((r) => r.uf === "rj");
    el("baixada-sources").innerHTML =
      `<p>Recorte: <a href="${esc(s.group.source)}" target="_blank" rel="noopener">definição de ${fmt(s.group.members.length)} municípios ↗</a>. A Baixada está contida na Região Metropolitana; não se somam recortes sobrepostos.</p>
      <p><a href="data/municipalities/rj.json" download>Base municipal processada ↓</a> · <a href="${esc(state.turns["1"].source)}" target="_blank" rel="noopener">TSE 1º turno, RJ ↗</a> · <a href="${esc(state.turns["2"].source)}" target="_blank" rel="noopener">TSE 2º turno, RJ ↗</a>. As fontes estaduais são referência, não o total direto do recorte.</p>
      <p>Coleta: ${new Date(overview.fetchedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}. Total de cada indicador = soma dos 13 municípios. Saldo = votos Lula − votos Flávio; mudança do saldo = saldo no 2º − saldo no 1º turno. Comparecimento é contagem, não taxa. Geometria: malha municipal do IBGE compilada no projeto. Este mapa mostra território, não residência ou preferência individual.</p>`;
    renderMap(s, geometry);
    renderRanking("margin");
    el("historia-baixada").querySelectorAll("[data-baixada-metric]").forEach((button) => {
      button.onclick = () => renderRanking(button.dataset.baixadaMetric);
    });
  }
  function renderMap(s, geometry) {
    const lookup = new Map(s.places.map((p) => [String(p.record.ibge), p]));
    const selected = geometry.features.map((feature) => ({
      feature, place: lookup.get(String(feature.properties.cd_geocmu)),
    })).filter((item) => item.place);
    const collection = { type: "FeatureCollection", features: selected.map((x) => x.feature) };
    const projection = d3.geoMercator().fitExtent([[20, 20], [540, 310]], collection);
    const path = d3.geoPath(projection);
    const max = Math.max(...s.places.map((p) => Math.abs(p.margin)));
    const color = d3.scaleLinear().domain([-max, 0, max])
      .range(["#ed967f", "#304b52", "#77dfc1"]).clamp(true);
    d3.select(el("baixada-map")).selectAll("path").data(selected).join("path")
      .attr("d", (d) => path(d.feature))
      .attr("fill", (d) => color(d.place.margin))
      .attr("tabindex", 0).attr("role", "button")
      .attr("aria-label", (d) => `${d.place.record.name}: mudança do saldo ${signed(d.place.margin)} votos. Abrir no atlas.`)
      .on("click", (_, d) => openPlace(d.place.record))
      .on("keydown", (event, d) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openPlace(d.place.record);
        }
      });
    el("baixada-map-legend").textContent =
      `Cor: mudança do saldo Lula − Flávio, de -${fmt(max)} a +${fmt(max)} votos. Escala desta história: 13 municípios; o atlas permite fixar a régua entre mapas municipais do Brasil.`;
  }
  function renderRanking(metric) {
    const rows = story.places.slice().sort((a, b) => b[metric] - a[metric]);
    const max = Math.max(1, ...rows.map((p) => Math.abs(p[metric])));
    el("baixada-ranking-note").textContent = metric === "margin"
      ? "Mudança do saldo Lula − Flávio, em votos. Positivo favorece Lula."
      : "Diferença na quantidade de pessoas que compareceram, 2º turno menos 1º. Não informa em quem votaram.";
    el("baixada-ranking").innerHTML = rows.map((p) =>
      `<li><button type="button" data-place="${esc(p.record.code)}" aria-label="${esc(p.record.name)}: ${signed(p[metric])} ${metric === "margin" ? "votos na mudança do saldo" : "comparecimentos"}; abrir no atlas"><span>${esc(p.record.name)}</span><b>${signed(p[metric])}</b><i class="${p[metric] < 0 ? "is-negative" : ""}" style="width:${Math.max(2, Math.abs(p[metric]) / max * 100)}%"></i></button></li>`).join("");
    el("baixada-ranking").querySelectorAll("[data-place]").forEach((button) => {
      button.onclick = () => openPlace(story.rows.find((r) => r.code === button.dataset.place));
    });
    el("historia-baixada").querySelectorAll("[data-baixada-metric]").forEach((button) =>
      button.setAttribute("aria-pressed", String(button.dataset.baixadaMetric === metric)));
  }
})();
