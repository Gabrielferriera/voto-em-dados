# Contexto territorial e social do RJ

O arquivo `dist/data/context-rj.json` contém 92 municípios, unidos aos resultados eleitorais pelo código IBGE de sete dígitos. Os dados sociais são do **Censo Demográfico 2022**, enquanto o recorte eleitoral é de **2026**. Essa diferença precisa permanecer explícita na interface e nas exportações.

## Indicadores disponíveis

| Chave | Indicador | Unidade e universo | Fonte |
| --- | --- | --- | --- |
| population | População residente | Pessoas, todas as idades | SIDRA 4714, variável 93 |
| density | Densidade demográfica | Habitantes por km² | SIDRA 4714, variável 614 |
| area | Área da unidade territorial | km² | SIDRA 4714, variável 6318 |
| literacy | Taxa de alfabetização | % das pessoas de 15 anos ou mais; totais de sexo, cor/raça e idade | SIDRA 9543, variável 2513 |
| medianAge | Idade mediana | Anos; população residente | SIDRA 9515, variável 10613 |

Cobertura: 92/92 em cada indicador, sem valores estimados ou preenchimentos artificiais. A soma da população municipal é 16.055.174 pessoas. O arquivo inclui definição, denominador, ano, unidade, URL da tabela e da consulta da API para cada indicador.

Fontes oficiais:

- https://sidra.ibge.gov.br/tabela/4714
- https://sidra.ibge.gov.br/tabela/9543
- https://sidra.ibge.gov.br/tabela/9515

Respostas integrais e hashes SHA-256 estão em `dist/data/context-source/`. `python scripts/fetch_context.py` reconstrói a base a partir desses arquivos, sem rede. `--refresh` renova os downloads oficiais para as mesmas consultas de 2022. `python scripts/check_context.py` verifica hashes, universo, limites dos indicadores, composição regional e correspondência de todos os códigos.

Taxas e medianas municipais **não são somáveis**. Sem denominadores detalhados, não calcular a alfabetização agregada da Baixada por média simples; tampouco calcular uma mediana regional pela média das medianas. A população regional pode ser somada. Densidade regional exige soma de população / soma de área, com as devidas definições.

## Grupos territoriais

- Capital: município do Rio de Janeiro (1).
- Baixada Fluminense: recorte de 13 municípios explicitamente listado pela Câmara Municipal de Duque de Caxias: Itaguaí, Paracambi, Seropédica, Japeri, Queimados, Nova Iguaçu, Duque de Caxias, Belford Roxo, Mesquita, Nilópolis, São João de Meriti, Magé e Guapimirim. Fonte: https://www.cmdc.rj.gov.br/?page_id=2520 . Há outras definições de Baixada, por isso o recorte precisa ser exposto.
- Região Metropolitana: 22 municípios listados pela Secretaria Especial de Integração Metropolitana da Prefeitura do Rio. Fonte: https://integracaometropolitana.prefeitura.rio/conheca-a-secretaria/ . Inclui capital e os 13 municípios da Baixada.
- Interior · fora da RMRJ: complemento de 70 municípios. É um **recorte operacional desta plataforma**, não uma região administrativa oficial única.

Os grupos se sobrepõem. Não somar capital, Baixada e metropolitana como conjuntos disjuntos. A divisão metropolitana + interior é disjunta e cobre os 92 municípios.

## Contexto e interpretação

Uma associação entre alfabetização ou idade mediana e um resultado eleitoral descreve municípios. Não identifica a escolha de qualquer indivíduo, a relação de causa e efeito, nem a condição dos eleitores de uma seção. Municípios pequenos e grandes têm peso igual em uma correlação municipal sem ponderação; explicitar quando for o caso.

Não foram incluídos renda ou saneamento. Eles requerem definição e universo específicos e uma consulta adicional validada. Não substituir indicadores censitários de 2022 por valores de outro ano sem alterar seus metadados. Não projetar indicadores municipais para bairros, favelas ou seções eleitorais.

## Viabilidade do detalhe por local de votação

O portal oficial do TSE lista os conjuntos necessários:

1. Resultados 2026, recurso “RJ - Votação por seção eleitoral - 2026”: https://dadosabertos.tse.jus.br/dataset/resultados-2026/resource/0069b075-2f46-449a-9881-0d63be3046fe
   Arquivo anunciado pelo CKAN: https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_secao/votacao_secao_2026_RJ.zip
2. Eleitorado 2026, recurso “Eleitorado por local de votação - 2026”: https://dadosabertos.tse.jus.br/dataset/eleitorado-2026/resource/300626b4-2b24-4d2e-b4fc-46b569cfffe5
   Arquivo anunciado: https://cdn.tse.jus.br/estatistica/sead/odsele/eleitorado_locais_votacao/eleitorado_local_votacao_2026.zip

Os arquivos de votação são anunciados como atualizados ao final de cada turno. Foi feita a inspeção limitada documentada abaixo, sem baixar integralmente os ZIPs nacionais ou o grande arquivo de votação RJ. A votação presidencial dos dois turnos por seção ainda não foi reconciliada. Antes de implementar esse nível: conferir ano/turno/cargo, chaves de UF+município+zona+seção, composição e agregações de seções, mudanças de local, validade de coordenadas, correspondência entre turnos e soma contra totais municipais.

Não apresentar centróides municipais como se fossem endereços de escolas. Não inferir a residência dos eleitores a partir do local de votação. Não inferir votos de candidatos por horário a partir de votos por seção ou do horário de transmissão do resultado. Logs de urna e totalização são bases distintas.


### Inspeção limitada dos arquivos oficiais

Verificação HTTP feita em 27/10/2026 por volta de 03h UTC. Ambos os recursos responderam **200** ao HEAD e anunciaram suporte a requisições por intervalo de bytes (`Accept-Ranges: bytes`).

| Recurso | Tamanho ZIP | Última modificação HTTP (UTC) |
| --- | ---: | --- |
| Votação por seção RJ | 296.106.129 bytes | 26/10/2026 17:53:09 |
| Cadastro de locais Brasil | 167.493.511 bytes | 25/10/2026 18:32:19 |

Requisições HTTP Range responderam 206. A inspeção dos diretórios ZIP e dos trechos iniciais transferiu cerca de 33 KB. O ZIP RJ contém `votacao_secao_2026_RJ.csv`, de 2.076.543.248 bytes descompactados, mais um leia-me. Seu cabeçalho confirma campos de ano, turno, eleição, cargo, município, zona, seção, número e nome do local, endereço e votos. O trecho inicial inspecionado contém registros do primeiro turno de cargos diferentes; **essa amostra não comprova nem refuta a presença dos resultados presidenciais do segundo turno**. Uma varredura/processamento completo é necessária para responder e conferir os totais. Há ainda um recurso presidencial nacional anunciado pelo TSE em `https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_secao/votacao_secao_2026_BR.zip`, não processado nesta etapa.

O ZIP nacional do cadastro contém um membro específico RJ de 5.582.981 bytes comprimidos (31.776.647 bytes descompactados). Esse membro foi extraído isoladamente por Range, com aproximadamente 5,59 MB transferidos, sem baixar os 167 MB do ZIP nacional. SHA-256 dos bytes descompactados: `58ca2c6db08531af6f30cc92873490ccb31e3cb9f8a7f6acc38ce79beb6bb47e`.

O cadastro RJ inspecionado tem **77.476 linhas** e os dois turnos. Chave de local usada na contagem: município TSE + zona + número do local. Há 38.738 linhas de seção em cada turno, distribuídas pelos 92 municípios.

| Turno | Locais distintos | Locais com coordenadas dentro da caixa geográfica RJ |
| --- | ---: | ---: |
| 1º | 5.061 | 5.058 |
| 2º | 5.060 | 5.056 |

O teste de coordenadas somente verificou números convertíveis e latitude entre -24 e -20, longitude entre -46 e -40. Não verifica se a coordenada está no município correto, se corresponde ao endereço ou se há pontos duplicados. Campos confirmados: `NR_LATITUDE`, `NR_LONGITUDE`, `NR_TURNO`, `NR_SECAO_PRINCIPAL`, tipo de seção agregada, endereço e bairro do local.

**Conclusão técnica:** o mapa de locais é viável e o cadastro oficial contém coordenadas com ampla cobertura. O trabalho pendente é processar e reconciliar resultados presidenciais por seção/local entre os turnos, verificar agregações/mudanças de local e validar coordenadas. A ausência desse nível na interface não deve ser atribuída à inexistência de cadastro ou de coordenadas. Nenhum resultado da inspeção foi incorporado como dados eleitorais locais no aplicativo.

### Processamento completo concluído: locais com votos presidenciais

**Esta etapa supera a limitação de inspeção acima.** Após a autorização para processar os arquivos maiores, o ZIP estadual RJ foi percorrido integralmente: 6.820.804 registros, nenhum deles com `CD_CARGO=1`. Para a Presidência o recurso correto é o **ZIP BR** do TSE, filtrado por `SG_UF=RJ`, `CD_CARGO=1`, ano 2026 e turnos 1/2.

O ZIP presidencial BR de 241.891.087 bytes foi baixado para `.cache/polling-rj/` (ignorado pelo Git). Seus 5.731.614 registros foram lidos em fluxo, sem descompactar o CSV integral em disco; 449.135 registros se referem à Presidência no RJ. Data/hora de geração informada: 26/10/2026 12:07:25. SHA-256 do ZIP BR: `c928321f63f2d095706fca73d4607c048d2ada23bda6876455d6911aaf1bc9c1`.

Arquivo pronto para uso: **`dist/data/polling-places-rj.json`**, com **5.034 locais** nos **92 municípios**, todos com registros dos dois turnos. A chave é município TSE + zona + número do local. Nome, endereço, bairro e coordenadas são mantidos por turno. Há 5 chaves com alteração de endereço ou coordenada/status entre turnos; isso não demonstra, por si só, mudança física do local ou transferência de eleitores.

Foram conferidos **exatamente** contra a base municipal do projeto, em cada um dos 92 municípios e nos dois turnos:

- Votos de todos os 12 candidatos válidos do primeiro turno e dos dois finalistas do segundo.
- Total de válidos, brancos e nulos.

O arquivo contém 387 votos nominais do número 28, Leonardo Alves de Araujo, no primeiro turno, que não fazem parte dos 12 candidatos válidos do quadro EA20 usado na plataforma. Eles foram preservados em `excludedNominalVotes` e `technicalNull`. Sua soma coincide exatamente com o campo oficial `vnt` de **cada município**, e é incluída no total oficial de nulos `tvn`. A classificação não foi inferida de uma notícia nem incorporada aos válidos; foi conferida contra os snapshots oficiais municipais em `dist/data/raw/rj.jsonl.gz`.

| Cobertura dos locais com resultado presidencial | 1º turno | 2º turno |
| --- | ---: | ---: |
| Locais com resultado | 5.034 | 5.034 |
| Locais encontrados no cadastro do respectivo turno | 5.030 | 5.028 |
| Locais com coordenada dentro da geometria municipal | 4.815 | 4.813 |
| Coordenada fora da geometria municipal do projeto | 215 | 215 |
| Sem correspondência com cadastro | 4 | 6 |
| Seções distintas com registros presidenciais | 37.675 | 37.675 |

Coordenadas ausentes ou fora do polígono municipal simplificado foram definidas como `null` para plotagem, conservando votos e endereço. `coordinateStatus='verified_municipality'` significa somente que a coordenada do cadastro está contida na geometria municipal usada; não é validação de campo ou confirmação do endereço. Os 215 casos por turno podem incluir problemas no cadastro ou imprecisões da geometria simplificada, portanto não foram corrigidos por estimativa.

O cadastro tem 38.738 linhas de seção por turno, mas o arquivo de resultados presidenciais contém 37.675 seções distintas. São universos diferentes, com seções agregadas e situações cadastrais. Não tratar a diferença como quantidade de votos faltantes: os totais de todos os municípios reconciliaram exatamente. Tampouco confundir os 5.034 locais com resultado com o total de 5.060 locais cadastrados no segundo turno.

Reprodução: `python scripts/fetch_polling_rj.py`. O script reutiliza arquivos em `.cache/polling-rj/`; `--refresh` renova as fontes. A extração do cadastro baixa apenas o membro RJ por Range, sem baixar o ZIP nacional completo. O arquivo do aplicativo só é gravado depois da conferência exata dos totais. Verificação independente: `python scripts/check_polling_rj.py`.

A base permite agora mapa e tabela de resultados **por local de votação no RJ**. Não representa voto por residência, resultado por bairro de moradia, preferência individual nem votos por horário.
