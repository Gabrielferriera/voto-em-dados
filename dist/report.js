/* Self-contained, printable territorial sheet. All numbers come from the atlas snapshots. */
(() => {
  const el = (id) => document.getElementById(id);
  const fmt = (n, digits = 0) => n == null || !Number.isFinite(n) ? "—" :
    new Intl.NumberFormat("pt-BR", { maximumFractionDigits: digits,
      minimumFractionDigits: digits }).format(n);
  const signed = (n, digits = 0) => n == null ? "—" :
    (n > 0 ? "+" : "") + fmt(n, digits);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const base = new URL(".", document.currentScript.src);
  const ref = (u, label) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`;
  let request = 0;
  async function mapFor(r) {
    if (r.uf === "zz") return "<p>O exterior não possui polígono nesta base cartográfica.</p>";
    const municipality = r.level === "mu", region = r.level === "region";
    const path = municipality || region ? `data/geometry/${r.uf}.json` : "data/geometry/states.json";
    const response = await fetch(new URL(path, base));
    if (!response.ok) throw Error("Cartografia indisponível");
    const geo = await response.json();
    const selected = geo.features.filter((f) => municipality
      ? String(f.properties.cd_geocmu) === String(r.ibge)
      : region ? r.members.includes(String(f.properties.cd_geocmu))
        : r.uf === "br" ? true : f.properties.sigla?.toLowerCase() === r.uf);
    if (!selected.length) return "<p>Geometria não disponível para este recorte.</p>";
    const collection = { type: "FeatureCollection", features: selected };
    const projection = d3.geoMercator().fitExtent([[12, 12], [648, 224]], collection);
    const pathMaker = d3.geoPath(projection);
    const shapes = selected.map((f) => `<path d="${esc(pathMaker(f))}" />`).join("");
    return `<svg viewBox="0 0 660 236" role="img" aria-label="Contorno geográfico de ${esc(r.name)}"><g>${shapes}</g></svg><small>Contorno geográfico; não representa a distribuição individual de eleitores.</small>`;
  }
  async function contextFor(r) {
    if (r.uf !== "rj" || r.level !== "mu")
      return "<p>Contexto do Censo nesta ficha: disponível para municípios do RJ. Nenhuma taxa municipal é extrapolada para regiões ou estados.</p>";
    let context = window.rjContext;
    if (!context) {
      const response = await fetch(new URL("data/context-rj.json", base));
      if (!response.ok) throw Error("Contexto indisponível");
      context = await response.json();
    }
    const selected = context.municipalities.find((m) => String(m.ibge) === String(r.ibge));
    if (!selected) return "<p>Indicadores não disponíveis para este município.</p>";
    const rows = Object.entries(context.indicators).map(([key, meta]) =>
      `<tr><th>${esc(meta.label)}</th><td>${fmt(selected.values[key], key === "literacy" || key === "density" || key === "area" ? 2 : 0)} ${esc(meta.unit)}</td><td>${ref(meta.source, `IBGE · tabela ${meta.table}`)}</td></tr>`).join("");
    return `<p>Indicadores de <strong>2022</strong>, apresentados como contexto, sem inferência sobre o voto de indivíduos.</p><table><thead><tr><th>Indicador</th><th>Valor</th><th>Fonte</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  const row = (label, x, y, d, unit = "") =>
    `<tr><th>${esc(label)}</th><td>${fmt(x)}${unit}</td><td>${fmt(y)}${unit}</td><td>${signed(d)}${unit}</td></tr>`;
  function compose(r, m, map, context) {
    const a = r.turns["1"], b = r.turns["2"],
      collected = window.atlasData?.fetchedAt,
      date = collected ? new Date(collected).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Data não disponível";
    const candidate = (n, name) => {
      const c = m.candidates[n], width = c.p2 == null ? 0 : Math.min(100, Math.max(0, c.p2));
      return `<div class="report-candidate report-candidate-${n}"><div><b>${name}</b><strong>${fmt(c.y)} votos · ${fmt(c.p2, 2)}% dos válidos no 2º turno</strong></div><div class="report-track"><span style="width:${width}%"></span></div><small>1º turno: ${fmt(c.x)} votos (${fmt(c.p1, 2)}%) · Δ votos ${signed(c.delta)} · Δ participação ${signed(c.pp, 2)} p.p.</small></div>`;
    };
    const sources = r.level === "region"
      ? `<p>Recorte calculado pela soma de ${fmt(r.members.length)} municípios, a partir da ${ref(new URL("data/municipalities/rj.json", base).href, "base municipal do RJ")}. Os arquivos oficiais da UF abaixo servem de referência, não como total direto do recorte.</p>`
      : "";
    return `<header class="report-header"><div><span>VOTO EM DADOS / FICHA TERRITORIAL</span><h2 id="report-heading">${esc(r.name)}</h2><p>${r.level === "mu" ? `Município · ${esc(r.uf.toUpperCase())} · IBGE ${esc(r.ibge)}` : r.level === "region" ? `Recorte calculado · RJ · ${fmt(r.members.length)} municípios` : r.uf === "br" ? "Brasil · inclui exterior" : `UF / exterior · ${esc(r.uf.toUpperCase())}`}</p></div><span>Presidência 2026<br>1º → 2º turno</span></header>
      <div class="report-grid"><section class="report-map">${map}</section><section><h3>Leitura do resultado</h3><p>A mudança do saldo Lula − Flávio foi de <strong>${signed(m.margin)} votos</strong>. Trata-se de uma diferença entre totais agregados, sem identificar transferência individual de votos.</p><p>Comparecimento: <strong>${signed(m.turnout.delta)} pessoas</strong> entre turnos. Taxa: ${fmt(m.turnout.p1, 2)}% → ${fmt(m.turnout.p2, 2)}% (${signed(m.turnout.pp, 2)} p.p.).</p></section></div>
      <h3>Votos dos finalistas</h3>${candidate("13", "Lula")}${candidate("22", "Flávio Bolsonaro")}
      <h3>Participação e composição</h3><table><thead><tr><th>Indicador</th><th>1º turno</th><th>2º turno</th><th>Diferença</th></tr></thead><tbody>${row("Comparecimento", a.turnout, b.turnout, m.turnout.delta)}${m.rows.map((i) => row(({valid:"Válidos",blank:"Brancos",null:"Nulos",abstention:"Abstenções"})[i.key], i.x, i.y, i.delta)).join("")}</tbody></table>
      <h3>Território e contexto</h3>${context}
      <section class="report-method"><h3>Fontes e leitura responsável</h3>${sources}<p>${ref(a.source, "TSE · 1º turno")} · ${ref(b.source, "TSE · 2º turno")} · ${ref(new URL("data/overview.json", base).href, "Base processada e cobertura")}</p><p>Coleta do TSE: ${esc(date)}. Os arquivos são um retrato estático. Percentuais dos candidatos têm os votos válidos de cada turno como denominador; taxa de comparecimento = comparecimento ÷ (comparecimento + abstenções). Δ = segundo turno − primeiro turno. p.p. = diferença entre percentuais. Censo 2022 e eleição 2026 têm períodos distintos. Não há dados por horário de votação nesta ficha.</p></section>
      <footer>Cartografia por Gabriel Ferreira · ${esc(location.origin)} · Consulte os links originais antes de reutilizar os números.</footer>`;
  }
  async function openReport() {
    const r = window.atlasRecord;
    if (!r?.turns?.["1"] || !r?.turns?.["2"]) return;
    const ticket = ++request, dialog = el("report-dialog");
    el("report-body").innerHTML = `<h2 id="report-heading">Preparando ficha de ${esc(r.name)}…</h2>`;
    el("report-print").disabled = true;
    window.persistAtlasURL?.();
    el("report-link").value = location.href;
    dialog.showModal();
    const [map, context] = await Promise.allSettled([mapFor(r), contextFor(r)]);
    if (ticket !== request || !dialog.open) return;
    const mapHTML = map.status === "fulfilled" ? map.value : "<p>Mapa não carregado; valores e fontes permanecem disponíveis.</p>";
    const contextHTML = context.status === "fulfilled" ? context.value : "<p>Contexto do Censo indisponível nesta consulta.</p>";
    el("report-body").innerHTML = compose(r, ReportModel.summarize(r), mapHTML, contextHTML);
    el("report-print").disabled = false;
  }
  el("report-open").onclick = openReport;
  el("report-close").onclick = () => el("report-dialog").close();
  el("report-print").onclick = () => {
    document.body.classList.add("report-printing");
    window.print();
  };
  window.addEventListener("afterprint", () => document.body.classList.remove("report-printing"));
  el("report-dialog").addEventListener("close", () => {
    request++;
    document.body.classList.remove("report-printing");
  });
  el("report-copy").onclick = async () => {
    const input = el("report-link");
    try {
      await navigator.clipboard.writeText(input.value);
      el("report-copy").textContent = "Link copiado ✓";
    } catch {
      input.select();
      el("report-copy").textContent = "Selecione e copie o link";
    }
  };
  window.addEventListener("atlas:record", () => (el("report-open").disabled = false));
  if (window.atlasRecord) el("report-open").disabled = false;
})();
