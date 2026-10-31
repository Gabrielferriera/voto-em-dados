# Voto em Dados — Presidência 2026
Site estático com resultados oficiais TSE, comparação entre primeiro e segundo turnos e filtros por UF e município. Todos os candidatos do primeiro turno; variações somente para quem concorreu nos dois. Exportação CSV e resumo com fonte.

## Executar
`python -m http.server 8000 --directory dist`

## Atualizar dados
`python scripts/fetch_tse.py --workers 28 --rps 20`
A coleta é retomável em `.cache/tse`. Use `--refresh` para renovar. Os arquivos oficiais completos ficam compactados em `dist/data/raw/`, com URL e SHA-256.

## VS Code e Vercel
Abra `voto-em-dados.code-workspace` no VS Code. O guia completo está em [docs/publicacao.md](docs/publicacao.md). A configuração `vercel.json` publica `dist/` como site estático, sem compilação, instalação de dependências ou chaves de API.

## Limites
A base compara 04/10 com 25/10/2026, não horários da apuração. Não contém contagem nacional de conclusões entre 17h e 19h. Ausência de contagem é dado desconhecido, não zero. Os resultados por candidatura não revelam escolhas individuais por horário. Logs exigem correção de fuso e cobertura; votos após 17h não equivalem automaticamente a efeito causal da prorrogação.

Fontes: https://www.tse.jus.br/eleicoes/informacoes-tecnicas-sobre-a-divulgacao-de-resultados e https://www.tse.jus.br/comunicacao/noticias/2026/Outubro/esclarecimento-sobre-prorrogacao-da-votacao

Código: MIT. Dados: TSE, atribuição à fonte. Autor: Gabriel Ferreira.

## Inspeção offline de logs
O script `scripts/parse_logs_offline.py` processa logs oficiais já obtidos, exigindo manifesto de origem e fuso. Consulte `python scripts/parse_logs_offline.py --help`. O exemplo de manifesto demonstra o formato; não representa cobertura nacional. Casos de contingência e inconsistências exigem revisão. Os resultados por candidato não são cruzados com horários.

## Verificar os totais
`python scripts/check_data.py`
Confere a soma de todos os municípios contra cada UF nos dois turnos, incluindo votos válidos, brancos, nulos, comparecimento e abstenção. O exterior é tratado separadamente.

Execute `python scripts/check_all.py` para rodar todas as verificações. Node.js é necessário apenas para as verificações JavaScript; o site pronto funciona sem Node.

## Cartografia digital
Mapa nacional por UF e, ao selecionar um estado, mapa municipal. Candidatos Lula/Flávio; variação de votos, variação em p.p., votos e percentual do segundo turno. Clique ou Enter abre o resultado. Zoom por botões ou arraste; Ctrl+roda amplia.
Geometrias: https://github.com/henriquemalvar/br-geojson (compilado das APIs do IBGE, CC0), congeladas em dist/data/geometry. Join pelo código IBGE; 27 UFs e 5.571 municípios. D3 7.9.0, licença ISC, incluído localmente. Verifique com `node scripts/check_geometry.cjs`.

## Atlas 3D · nova interface

Interface escura com acentos jade e coral, painéis progressivos e recorte rápido do Rio de Janeiro. O mapa usa os polígonos geográficos existentes: a extrusão é um relevo **estatístico**, não topográfico. Altura = `1,15 + 14 × |valor| / máximo absoluto` em unidades da cena; a espessura mínima é apenas suporte visual. Cor expressa sinal e magnitude; a escala é recalculada por estado/indicador. Áreas não representam eleitores. Sombras e perspectiva podem ocultar polígonos: a visão 2D e as tabelas preservam o acesso aos valores.

- `dist/styles.css`: sistema visual, responsividade e preferência por movimento reduzido.
- `dist/analytics.js`: cálculos puros, compartilhados pelo front e pela verificação Node.
- `dist/app.js`: filtros, estado da consulta, análises, tabelas paginadas, CSV e resumo.
- `dist/atlas3d.js`: Three.js, geometria extrudada, iluminação, interação e exportação PNG.
- `dist/software-renderer.js`: projeção 3D sobre Canvas 2D quando WebGL não está disponível; iluminação simplificada.
- `dist/map.js`: alternativa 2D com D3 e navegação por teclado nos polígonos.

Three.js 0.170.0 está incluído localmente, com licença MIT em `dist/vendor/THREE-LICENSE.txt`. Sem CDN em tempo de execução, backend, rastreamento ou chaves de API. O mapa oferece rotação por arraste, zoom, rotação automática opcional e modo apresentação. Filtros são preservados na URL. PNG inclui fonte, indicador, recorte e escala; CSV contém URLs dos dois turnos.

### Novas análises

1. Decomposição simétrica: variação nos votos = `média(fração do candidato) × Δ(válidos) + média(válidos) × Δ(fração do candidato)`. É uma identidade aritmética, sem interpretação causal. Indisponível se algum turno não tem válidos.
2. Concentração dos ganhos: cinco maiores aumentos / soma dos aumentos positivos. As perdas são reportadas separadamente; o denominador não é o ganho líquido. Nacional usa 27 UFs, sem exterior; estadual usa seus municípios, inclusive ao selecionar uma cidade.
3. Viradas: troca da liderança entre os dois finalistas. Empates e localidades sem válidos ficam separados. Não confundir com transferência individual de voto nem com o vencedor geral do primeiro turno.

Verificação adicional: `node scripts/check_analytics.cjs` (casos fixos, ausência de válidos, ganhos/perdas, empates, viradas e identidade em toda a base).

### Validação desta interface

Conferidos no navegador: Brasil, 92 municípios do RJ, Niterói, troca de candidato/indicador, alternativa 2D, filtros na URL e exportação PNG. Responsividade inspecionada em largura de 375 px, sem vazamento horizontal. O navegador de verificação não disponibiliza WebGL: o relevo 3D foi verificado pelo renderizador Canvas. Iluminação e desempenho da GPU ainda precisam ser conferidos em um dispositivo com WebGL, especialmente no celular e em estados com muitos municípios.

## Investigação territorial · versão atual

O atlas agora oferece navegação Brasil → UF → região/município, câmera com enquadramento animado e rótulos. No foco municipal 3D, o polígono é isolado e a escala se refere a esse recorte; o caminho superior retorna ao estado. O modo **Peso eleitoral** usa círculos cuja área é proporcional aos válidos do segundo turno, com a cor reservada ao indicador selecionado. Pontos centrais não representam residências de eleitores.

O **Laboratório Fluminense** reúne capital, Baixada (13), Região Metropolitana (22) e interior fora da RMRJ (70). Definições e sobreposições são explícitas. Resultados regionais são somas municipais, não estimativas. O comparador permite dois estados, municípios disponíveis ou recortes fluminenses, com quantidades, taxas, composição dos votos e mudança do saldo Lula menos Flávio. Exporta CSV com fontes.

As três histórias guiadas usam os 92 municípios do RJ e explicam: ganho de votos com redução percentual, contribuição para a mudança do saldo entre finalistas e mudança no comparecimento. Fórmulas e ranking permanecem verificáveis.

O módulo **Território e contexto** cruza cinco indicadores municipais do Censo 2022 (população, alfabetização 15+, idade mediana, densidade e área) com resultados de 2026. A dispersão tem navegação por teclado, escala logarítmica opcional, tabela e CSV. Pearson é descritivo e atribui peso igual aos municípios; quando o eixo é logarítmico, a correlação usa log10(x). Nenhuma taxa ou mediana regional é obtida por média simples.

O módulo **Locais de votação** contém 5.034 locais do RJ com os dois turnos. Os totais foram reconciliados por município e candidato, incluindo válidos, brancos e nulos. Há 4.813 coordenadas do segundo turno validadas contra os polígonos municipais; os demais locais permanecem na tabela, sem ponto inventado. Locais sobrepostos podem ser selecionados pela tabela. O detalhe mantém votos dos dois finalistas e todos os candidatos válidos do primeiro turno. Mudanças cadastrais não são interpretadas automaticamente como mudança física ou transferência de eleitores.

A exportação de imagem tem prévia e formatos horizontal/vertical **1080 × 1920**, com fonte, recorte, indicador e escala. Links preservam UF, município, região e modo de visualização. A preferência de movimento reduzido continua respeitada.

### Escalas comparáveis e história territorial

No atlas, **Fixar escala entre territórios** usa o mesmo domínio para mapas de municípios, calculado sobre os 5.571 municípios da base. O mapa nacional usa outro domínio, calculado sobre as 27 UFs com geometria. A régua é específica do indicador e, quando pertinente, do candidato; porcentagens do segundo turno usam 0–100%. A mesma regra numérica vale para 2D e 3D, inclusive na seleção municipal. O modo dinâmico continua disponível. O parâmetro `escala=fixa` fica no link compartilhado e a legenda/exportação indica a régua utilizada. `node scripts/build_scale.cjs` recompõe `dist/data/scale-domains.json` a partir do retrato eleitoral; a verificação detecta domínios desatualizados.

**Histórias em Dados / 01 — Baixada Fluminense** apresenta uma reportagem cartográfica interativa sobre o saldo entre os finalistas e o comparecimento em 13 municípios. O mapa e o ranking levam ao atlas, e a página explicita composição, fontes, fórmulas e limites. Os números são somados dos resultados municipais atuais do projeto; `scripts/check_story_baixada.cjs` confere os totais e o exemplo de Japeri. O conteúdo não deduz transferências individuais nem preferências a partir do comparecimento.

O workflow público `.github/workflows/data-integrity.yml` executa `python scripts/check_all.py` em pushes e PRs. Toda segunda-feira e sob acionamento manual, `scripts/check_live_official.py` compara, em modo **somente leitura**, os totais nacionais e das UFs dos dois turnos com os arquivos correntes do TSE. Uma diferença reprova o workflow; não há atualização automática dos arquivos publicados, que exige revisão humana, nova coleta e novo deploy. A data exibida no site é a da coleta do retrato, não da última execução do workflow.

### Ficha territorial automática

Selecione Brasil, uma UF, um município ou um recorte fluminense e use **Gerar ficha territorial** no painel do atlas. A ficha combina contorno geográfico, votos e percentuais dos dois finalistas, variação do saldo, comparecimento, válidos, brancos, nulos, abstenções, links oficiais do TSE, data da coleta e definições das taxas. Em municípios do RJ, inclui cinco indicadores do Censo 2022 com fonte específica de cada tabela do IBGE; para outros recortes, omite indicadores que não podem ser somados ou extrapolados corretamente. Use **Imprimir / salvar PDF** no navegador ou copie o link da consulta para compartilhar os filtros.

O mapa é um contorno territorial, não uma distribuição de votos dentro do município. A ficha compara totais agregados e não identifica transferência de votos entre indivíduos nem votos por horário. `dist/report-model.js` concentra as fórmulas; `scripts/check_report.cjs` verifica um município conhecido e a consistência de todos os 92 municípios do RJ. Os resultados publicados são o retrato da coleta indicado na própria ficha, sem atualização automática.

### Código e verificações adicionais

- `dist/explorer.js`: comparação, recortes, histórias e contexto social.
- `dist/polling.js`: locais reais, cobertura e detalhamento.
- `scripts/check_explorer.cjs`: somas regionais, aditividade do saldo, correlação e condições das histórias.
- `scripts/check_context.py`: metadados, hashes, universo de 92 municípios e indicadores.
- `scripts/check_polling_rj.py`: reconciliação dos 5.034 locais em todos os municípios/turnos.
- `scripts/fetch_polling_rj.py`: processamento reprodutível do ZIP presidencial BR e cadastro de locais; entradas ficam em `.cache/`, fora da publicação.

Consulte `docs/context-rj.md` para fontes oficiais, classificação dos nominais não válidos, validação geográfica e distinção entre cadastro de seções e seções com resultados. Não publicar caches, credenciais ou arquivos `.openai` ao exportar para um repositório externo.

### Limites remanescentes

Renda e saneamento ainda não foram incorporados. Não há contagem de votos por horário de 17h a 19h. A verificação visual foi feita em desktop e em largura de 375 px; o navegador de QA utiliza o renderizador de compatibilidade porque WebGL está indisponível. A iluminação/desempenho da GPU requerem conferência em aparelho com WebGL. O pacote inclui configuração para publicação na Vercel; a presença desses arquivos não significa que o deploy foi concluído.
