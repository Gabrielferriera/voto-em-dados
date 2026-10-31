let data,
  current,
  rows = [],
  municipal = [],
  selectionVersion = 0,
  page = 0;
const $ = (id) => document.getElementById(id),
  fmt = (n) => (n == null ? "—" : new Intl.NumberFormat("pt-BR").format(n)),
  dec = (n) =>
    n == null || !Number.isFinite(n)
      ? "—"
      : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(n),
  signed = (n) => (n == null ? "—" : (n > 0 ? "+" : "") + fmt(n)),
  delta = (r, k) => r.turns["2"][k] - r.turns["1"][k];
const normalize = (s) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
function candidates(r, n) {
  return VoteAnalytics.candidate(r, n);
}
function toast(text) {
  $("toast").textContent = text;
  $("toast").hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($("toast").hidden = true), 4500);
}
function activeCandidate() {
  return $("map-candidate").value;
}
function metricValue(r) {
  if ($("map-metric").value === "margin") return VoteAnalytics.marginChange(r);
  if ($("map-metric").value === "turnout") return delta(r, "turnout");
  const c = candidates(r, activeCandidate());
  return $("map-metric").value === "delta"
    ? c.d
    : $("map-metric").value === "pp"
      ? c.p
      : $("map-metric").value === "votes"
        ? c.y
        : r.turns["2"].valid > 0
          ? (c.y / r.turns["2"].valid) * 100
          : null;
}
function metricText(n) {
  if (n == null || !Number.isFinite(n)) return "Não calculável";
  const key = $("map-metric").value;
  return ["pp", "share"].includes(key)
    ? (key === "pp" && n > 0 ? "+" : "") +
        dec(n) +
        (key === "pp" ? " p.p." : "%")
    : ["delta", "margin", "turnout"].includes(key)
      ? signed(n)
      : fmt(n);
}
function updateURL() {
  const u = new URL(location.href);
  u.search = "";
  if ($("uf").value !== "br") u.searchParams.set("uf", $("uf").value);
  if ($("mun").value) u.searchParams.set("municipio", $("mun").value);
  if (activeCandidate() !== "13")
    u.searchParams.set("candidato", activeCandidate());
  if ($("map-metric").value !== "delta")
    u.searchParams.set("indicador", $("map-metric").value);
  if (window.atlasRegion) u.searchParams.set("regiao", window.atlasRegion.id);
  if (window.atlasMode && window.atlasMode !== "3d")
    u.searchParams.set("visao", window.atlasMode);
  if ($("scale-fixed").checked) u.searchParams.set("escala", "fixa");
  history.replaceState(null, "", u);
}
function render(r) {
  if (!r) return;
  current = r;
  window.atlasRecord = r;
  window.atlasData = data;
  $("place").textContent = r.name;
  $("cards").innerHTML =
    ["13", "22"]
      .map((n) => {
        const c = candidates(r, n);
        return `<div class="card"><span>${data.candidates[n].name} · Δ entre turnos</span><div class="big">${signed(c.d)}</div><small>${fmt(c.y)} votos no 2º turno</small></div>`;
      })
      .join("") +
    `<div class="card"><span>Comparecimento · Δ entre turnos</span><div class="big">${signed(delta(r, "turnout"))}</div><small>${fmt(r.turns["2"].abstention)} abstenções no 2º turno</small></div>`;
  $("map-candidate").disabled = ["margin", "turnout"].includes(
    $("map-metric").value,
  );
  const val = metricValue(r);
  $("selected-stat").innerHTML =
    `<small>${$("map-metric").selectedOptions[0].text}</small><strong class="${val < 0 ? "negative" : ""}">${metricText(val)}</strong><p>${["delta", "pp", "margin", "turnout"].includes($("map-metric").value) ? "Segundo turno menos primeiro turno" : "Votos válidos · segundo turno"}</p>`;
  $("round-comparison").innerHTML = ["1", "2"]
    .map((t) => {
      const s = r.turns[t],
        v = s.votes[activeCandidate()],
        p = s.valid > 0 ? (v / s.valid) * 100 : null;
      return `<div class="round-row"><header><span>${t}º turno</span><b>${p == null ? "Sem válidos" : dec(p) + "%"} · ${fmt(v)}</b></header><div class="mini-track"><span style="width:${p || 0}%"></span></div></div>`;
    })
    .join("");
  $("results").innerHTML = Object.keys(data.candidates)
    .sort((x, y) => (r.turns["1"].votes[y] || 0) - (r.turns["1"].votes[x] || 0))
    .map((n) => {
      const c = candidates(r, n);
      return `<tr><td>${data.candidates[n].name} · ${data.candidates[n].party}</td><td>${fmt(c.x)}</td><td>${c.y == null ? "Não disputou" : fmt(c.y)}</td><td>${signed(c.d)}</td><td>${c.p == null ? "—" : (c.p > 0 ? "+" : "") + dec(c.p)}</td></tr>`;
    })
    .join("");
  $("sources").innerHTML =
    `<a href="${r.turns["1"].source}" target="_blank" rel="noopener">Arquivo oficial · 1º turno ↗</a><br><a href="${r.turns["2"].source}" target="_blank" rel="noopener">Arquivo oficial · 2º turno ↗</a>`;
  if (r.level === "region")
    $("sources").innerHTML =
      "<p>Recorte calculado pela soma de " +
      r.members.length +
      ' municípios. Os arquivos da UF abaixo são referência; a base municipal contém as parcelas.</p><a href="data/municipalities/rj.json" download>Base municipal usada no recorte ↓</a><br>' +
      $("sources").innerHTML.replaceAll(
        "Arquivo oficial",
        "Referência oficial da UF",
      );
  $("stats").innerHTML = [
    ["Comparecimento", "turnout"],
    ["Abstenções", "abstention"],
    ["Votos válidos", "valid"],
    ["Votos em branco", "blank"],
    ["Votos nulos", "null"],
  ]
    .map(
      ([label, k]) =>
        `<tr><td>${label}</td><td>${fmt(r.turns["1"][k])}</td><td>${fmt(r.turns["2"][k])}</td><td>${signed(delta(r, k))}</td></tr>`,
    )
    .join("");
  renderInsights();
  table();
  updateURL();
  $("snapshot").disabled = true;
  const jobs = [];
  if (window.drawElectionMap) jobs.push(window.drawElectionMap(r));
  if (window.drawAtlas) jobs.push(window.drawAtlas(r));
  window.atlasRenderReady = Promise.allSettled(jobs).then(() => {
    $("snapshot").disabled = false;
  });
  window.atlasRows = rows;
  window.atlasAllRows = r.uf === "br" ? data.states : municipal;
  window.dispatchEvent(
    new CustomEvent("atlas:record", { detail: { record: r, rows } }),
  );
}
function analysisRows() {
  return current.uf === "br" ? rows.filter((r) => r.uf !== "zz") : rows;
}
function renderInsights() {
  const n = activeCandidate(),
    a = current.turns["1"],
    b = current.turns["2"],
    parts = VoteAnalytics.decompose(current, n);
  const { volume, share } = parts || { volume: 0, share: 0 },
    max = Math.max(Math.abs(volume), Math.abs(share), 1);
  $("decomposition").innerHTML =
    [
      ["Volume de votos válidos", volume],
      ["Fatia do candidato nos válidos", share],
    ]
      .map(
        ([label, v]) =>
          `<div class="decomp-row"><span>${label}</span><strong class="${v < 0 ? "negative" : "positive"}">${signed(Math.round(v))}</strong><div class="mini-track"><span style="width:${(Math.abs(v) / max) * 100}%;background:${v < 0 ? "var(--coral)" : "var(--teal)"}"></span></div></div>`,
      )
      .join("") +
    `<p>Soma: <b>${signed(b.votes[n] - a.votes[n])} votos</b> · ${data.candidates[n].name}. Parcelas arredondadas podem diferir em 1 voto.</p>`;
  if (!parts)
    $("decomposition").innerHTML =
      "<p>Sem votos válidos em ao menos um turno. Decomposição indisponível.</p>";
  $("analysis-scope").textContent =
    "Decomposição: " +
    current.name +
    ". Concentração e viradas: " +
    (current.uf === "br"
      ? "27 UFs, sem exterior"
      : current.uf === "zz"
        ? "localidades no exterior"
        : "municípios de " +
          (window.atlasRegion?.name ||
            data.states.find((r) => r.uf === current.uf).name)) +
    ".";
  const items = analysisRows(),
    { gains, gross, top, topTotal, loss, to13, to22, ties, unavailable } =
      VoteAnalytics.summarize(items, n);
  $("concentration").innerHTML =
    `<div class="insight-number">${gross ? dec((topTotal / gross) * 100) : "0"}<small>%</small></div><p>dos ganhos positivos em ${top.length} ${current.level === "br" ? "UFs" : current.uf === "zz" ? "localidades" : "municípios"}.</p>`;
  $("top-gains").innerHTML =
    top
      .map(
        (r) =>
          `<div class="rank-row"><button data-id="${r.code || r.uf}"><header><span>${r.name}</span><b>${signed(candidates(r, n).d)}</b></header><div class="mini-track"><span style="width:${(candidates(r, n).d / (candidates(top[0], n).d || 1)) * 100}%"></span></div></button></div>`,
      )
      .join("") +
    `<p class="fine-print">Ganhos positivos: ${fmt(gross)} · Perdas: ${fmt(Math.abs(loss))} votos.${current.level === "br" ? " Exterior excluído desta análise territorial." : ""}</p>`;
  wireTerritoryButtons($("top-gains"), items);

  $("switches").innerHTML =
    `<div class="insight-number">${fmt(to13 + to22)}<small> ${current.level === "br" ? "UFs" : "localidades"}</small></div><div class="split-row"><span>Passaram a Lula</span><b>${fmt(to13)}</b></div><div class="split-row"><span>Passaram a Flávio</span><b>${fmt(to22)}</b></div>${ties ? `<p>Empate em ao menos um turno: ${ties}.</p>` : ""}${unavailable ? `<p>Sem votos válidos em um dos turnos: ${unavailable}.</p>` : ""}`;
  const p1 = (a.turnout / (a.turnout + a.abstention)) * 100,
    p2 = (b.turnout / (b.turnout + b.abstention)) * 100;
  $("participation").innerHTML =
    Number.isFinite(p1) && Number.isFinite(p2)
      ? `<div class="participation-note">Taxa de comparecimento<strong>${dec(p1)}% → ${dec(p2)}%</strong>${p2 - p1 > 0 ? "+" : ""}${dec(p2 - p1)} p.p. · no recorte selecionado</div>`
      : `<p>Taxa de comparecimento indisponível no recorte.</p>`;
}
function wireTerritoryButtons(container, items) {
  container
    .querySelectorAll("button[data-id]")
    .forEach(
      (btn) =>
        (btn.onclick = () =>
          chooseRecord(items.find((r) => (r.code || r.uf) === btn.dataset.id))),
    );
}
async function chooseRecord(r) {
  if (!r) return;
  if (r.level === "uf" || r.level === "br") {
    $("uf").value = r.uf;
    await loadState();
  } else {
    $("mun").value = r.code;
    render(r);
  }
}
window.chooseAtlasRecord = chooseRecord;
function table() {
  const q = normalize($("search").value),
    sort = $("sort").value;
  const filtered = rows
    .filter((r) => normalize(r.name).includes(q))
    .slice()
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name, "pt-BR")
        : sort === "weight"
          ? b.turns["2"].valid - a.turns["2"].valid
          : sort === "loss"
            ? candidates(a, activeCandidate()).d -
              candidates(b, activeCandidate()).d
            : candidates(b, sort).d - candidates(a, sort).d,
    );
  const pages = Math.ceil(filtered.length / 12);
  page = Math.max(0, Math.min(page, pages - 1));
  const displayed = filtered.slice(page * 12, page * 12 + 12);
  $("territories").innerHTML = displayed.length
    ? displayed
        .map(
          (r) =>
            `<tr><td><button data-id="${r.code || r.uf}">${r.name}${r.uf === "zz" ? " · sem geometria" : ""}</button></td><td>${signed(candidates(r, "13").d)}</td><td>${signed(candidates(r, "22").d)}</td><td>${signed(delta(r, "turnout"))}</td></tr>`,
        )
        .join("")
    : '<tr><td colspan="4">Nenhum território encontrado.</td></tr>';
  wireTerritoryButtons($("territories"), displayed);
  $("table-count").textContent = filtered.length
    ? `${page * 12 + 1}–${Math.min((page + 1) * 12, filtered.length)} de ${fmt(filtered.length)} territórios`
    : "0 territórios";
  $("previous").disabled = page === 0;
  $("next").disabled = page + 1 >= pages;
}
async function loadState(municipalityCode = "") {
  const version = ++selectionVersion,
    uf = $("uf").value;
  page = 0;
  window.atlasFocusCodes = null;
  window.atlasRegion = null;
  $("mun").innerHTML = '<option value="">Todos os municípios</option>';
  $("mun").disabled = uf === "br";
  if (uf === "br") {
    rows = data.states;
    render(data.national);
    $("status").textContent = "27 UFs + exterior · comparação entre turnos";
    return;
  }
  const state = data.states.find((r) => r.uf === uf);
  if (!state) return;
  rows = [];
  render(state);
  $("status").textContent = "Carregando municípios…";
  try {
    const response = await fetch(`data/municipalities/${uf}.json`);
    if (!response.ok) throw Error("Base municipal indisponível");
    const fetched = await response.json();
    if (version !== selectionVersion) return;
    municipal = fetched;
    rows = municipal.filter((r) => r.turns["1"] && r.turns["2"]);
    rows.forEach((r) => {
      const o = document.createElement("option");
      o.value = r.code;
      o.textContent = r.name;
      $("mun").append(o);
    });
    const selected = municipal.find((r) => r.code === municipalityCode);
    if (selected) $("mun").value = selected.code;
    render(selected || state);
    $("status").textContent =
      `${fmt(rows.length)} localidades com os dois turnos · ${state.name}`;
  } catch (e) {
    if (version !== selectionVersion) return;
    rows = [];
    table();
    $("status").textContent = e.message;
  }
}
$("uf").onchange = () => loadState();
$("mun").onchange = () =>
  render(
    $("mun").value
      ? municipal.find((r) => r.code === $("mun").value)
      : data.states.find((r) => r.uf === $("uf").value),
  );
$("search").oninput = () => {
  page = 0;
  table();
};
$("sort").onchange = () => {
  page = 0;
  table();
};
$("previous").onclick = () => {
  page--;
  table();
};
$("next").onclick = () => {
  page++;
  table();
};
for (const id of ["map-candidate", "map-metric"])
  $(id).addEventListener("change", () => render(current));
$("scale-fixed").addEventListener("change", () => render(current));
$("focus-rj").onclick = () => {
  $("uf").value = "rj";
  loadState();
  $("atlas").scrollIntoView({
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "instant"
      : "smooth",
  });
};
$("map-brasil").onclick = () => {
  $("uf").value = "br";
  loadState();
};
$("csv").onclick = () => {
  const clean = (x) => '"' + String(x).replaceAll('"', '""') + '"';
  const text =
    "Territorio;UF;Lula_1T;Lula_2T;Lula_delta;Flavio_1T;Flavio_2T;Flavio_delta;Comparecimento_delta;Fonte_1T;Fonte_2T\n" +
    rows
      .map((r) =>
        [
          r.name,
          r.uf,
          r.turns["1"].votes["13"],
          r.turns["2"].votes["13"],
          candidates(r, "13").d,
          r.turns["1"].votes["22"],
          r.turns["2"].votes["22"],
          candidates(r, "22").d,
          delta(r, "turnout"),
          r.turns["1"].source,
          r.turns["2"].source,
        ]
          .map(clean)
          .join(";"),
      )
      .join("\n");
  download(
    new Blob(["\ufeff" + text], { type: "text/csv;charset=utf-8" }),
    "voto-em-dados-" + $("uf").value + ".csv",
  );
};
function download(blob, name) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
window.downloadAtlas = download;
$("copy").onclick = async () => {
  if (!current) return;
  const text = `${current.name} · Presidência 2026. Entre os turnos: Lula ${signed(candidates(current, "13").d)} votos; Flávio Bolsonaro ${signed(candidates(current, "22").d)}. Fonte: TSE. Os totais não revelam transferências individuais nem votos por horário. ${current.turns["2"].source}\n${location.href}`;
  try {
    await navigator.clipboard.writeText(text);
    toast("Resumo com fonte e link copiado.");
  } catch {
    toast("Não foi possível acessar a área de transferência.");
  }
};
$("presentation").onclick = () => {
  document.body.classList.toggle("presentation");
  window.dispatchEvent(new Event("resize"));
  toast("Modo apresentação · pressione Esc para sair.");
};
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document.body.classList.remove("presentation");
    window.dispatchEvent(new Event("resize"));
  }
});
Promise.all(["data/overview.json", "data/scale-domains.json"].map(async (path) => {
  const response = await fetch(path);
  if (!response.ok) throw Error("Base ou escala indisponível");
  return response.json();
}))
  .then(async ([d, domains]) => {
    if (domains.sourceSnapshot !== d.fetchedAt)
      throw Error("Escala fixa incompatível com a versão dos dados");
    data = d;
    window.atlasData = d;
    window.atlasScaleDomains = domains;
    $("scale-fixed").disabled = false;
    d.states.forEach((r) => {
      const o = document.createElement("option");
      o.value = r.uf;
      o.textContent = r.name;
      $("uf").append(o);
    });
    const params = new URLSearchParams(location.search);
    window.atlasInitialParameters = Object.fromEntries(params);
    $("scale-fixed").checked = params.get("escala") === "fixa";
    if (["13", "22"].includes(params.get("candidato")))
      $("map-candidate").value = params.get("candidato");
    if (
      ["delta", "pp", "votes", "share", "margin", "turnout"].includes(
        params.get("indicador"),
      )
    )
      $("map-metric").value = params.get("indicador");
    const uf = params.get("uf");
    if (d.states.some((r) => r.uf === uf)) $("uf").value = uf;
    await loadState(params.get("municipio") || "");
    window.atlasLoaded = true;
    window.dispatchEvent(new CustomEvent("atlas:ready"));
    $("coverage").textContent =
      `Coleta: ${new Date(d.fetchedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}. Cobertura: ${fmt(d.municipalityCoverage.complete)} de ${fmt(d.municipalityCoverage.expected)} municípios nos dois turnos. Brasil inclui exterior.`;
  })
  .catch((e) => {
    $("status").textContent = "Não foi possível carregar a base: " + e.message;
    toast("Falha na base de dados. Tente recarregar a página.");
  });

window.navigateAtlas = async function (uf, code = "") {
  $("uf").value = uf;
  $("search").value = "";
  await loadState(code);
};
window.applyAtlasRegion = function (group) {
  const selected = municipal.filter((r) =>
    group.members.includes(String(r.ibge)),
  );
  window.atlasFocusCodes = group.members;
  window.atlasRegion = group;
  rows = selected;
  $("mun").innerHTML = '<option value="">' + group.name + "</option>";
  selected.forEach((r) => {
    const o = document.createElement("option");
    o.value = r.code;
    o.textContent = r.name;
    $("mun").append(o);
  });
  const aggregate = VoteAnalytics.aggregate(selected, {
    code: "region:" + group.id,
    name: group.name,
    region: group.id,
  });
  if (aggregate) {
    const state = data.states.find((r) => r.uf === "rj");
    for (const t of ["1", "2"])
      aggregate.turns[t].source = state.turns[t].source;
    render(aggregate);
    $("status").textContent =
      group.members.length +
      " municípios · " +
      group.name +
      " · recorte calculado pela soma municipal";
  }
};
window.returnAtlasRegion = function () {
  if (window.atlasRegion) window.applyAtlasRegion(window.atlasRegion);
  else if (current?.uf !== "br")
    render(data.states.find((r) => r.uf === current.uf));
};

window.persistAtlasURL = updateURL;
