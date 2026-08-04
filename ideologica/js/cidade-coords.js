// Posição de cada cidade que tem loja, já projetada no MESMO sistema de
// coordenadas do mapa (viewBox 0 0 760 781 de br-uf-paths.js) — por isso os
// valores são x/y direto, não lat/lon: evita reprojetar no browser e garante
// que pino e contorno do estado nunca saiam de registro.
//
// Origem: centroide da malha do municipio (IBGE, qualidade minima), calculado
// por AREA (nao media de vertices, que puxaria o ponto pro lado do municipio
// com contorno mais detalhado). Chave = "UF|Cidade", igual ao que
// lojaLocation() devolve em loja-location.js.
//
// Cidade nova: pegar o id em /api/v1/localidades/municipios e o centroide em
// /api/v3/malhas/municipios/<id>?formato=application/vnd.geo+json&qualidade=minima
const CIDADE_XY={
  "AM|Manaus":[266.2,158.1],
  "BA|Salvador":[688,363.1],
  "ES|Linhares":[658.6,493.4],
  "GO|Goiânia":[479.3,438.6],
  "GO|Mineiros":[411.7,457.7],
  "MA|Balsas":[536.2,270.3],
  "MG|Alfenas":[543.4,533.5],
  "MG|Belo Horizonte":[582.4,503.8],
  "MG|Montes Claros":[583,438.1],
  "MS|Campo Grande":[382.8,524],
  "MT|Cuiabá":[351.2,415.8],
  "PA|Belém":[495.1,130.4],
  "PA|Parauapebas":[455.7,228.6],
  "PB|João Pessoa":[758.7,248.9],
  "PE|Recife":[757.5,266.4],
  "PI|Picos":[629.7,246.8],
  "PR|Curitiba":[479,615.3],
  "PR|Francisco Beltrão":[404.5,626.8],
  "PR|Guarapuava":[436.3,613.2],
  "PR|Ponta Grossa":[463.7,608.6],
  "RJ|Campos dos Goytacazes":[632,540.7],
  "RN|Mossoró":[711.1,209.1],
  "RS|Camaquã":[430.5,724.3],
  "RS|Canoas":[442.4,704.1],
  "RS|Carazinho":[409.7,671.4],
  "RS|Caxias do Sul":[445.3,687.9],
  "RS|Cruz Alta":[396.1,679.9],
  "RS|Farroupilha":[438.7,690],
  "RS|Horizontina":[381.8,657.6],
  "RS|Ijuí":[389.7,672.3],
  "RS|Lajeado":[426.3,694.7],
  "RS|Passo Fundo":[417.6,671.2],
  "RS|Pelotas":[419.7,737.3],
  "RS|Porto Alegre":[442.6,707.6],
  "RS|Rio Grande":[418.6,750.2],
  "RS|Santa Cruz do Sul":[418.5,698.7],
  "RS|Santa Maria":[391,701.6],
  "RS|Santa Rosa":[378,663.2],
  "RS|Santana do Livramento":[357.3,720.6],
  "RS|Santo Ângelo":[381.9,670.8],
  "RS|Teutônia":[430.7,695.3],
  "SC|Caçador":[444.1,641.1],
  "SC|Chapecó":[413.8,648.3],
  "SC|Florianópolis":[494.1,657.5],
  "SC|Porto União":[445.7,633.5],
  "SP|Americana":[517.9,560.2],
  "SP|Barretos":[491.4,516],
  "SP|Botucatu":[495,563],
  "SP|Campinas":[522.5,563.4],
  "SP|Franca":[516,516.9],
  "SP|Indaiatuba":[519.5,567.9],
  "SP|Limeira":[516.4,557.7],
  "SP|Piracicaba":[508.2,560.2],
  "SP|Pirassununga":[515.9,545.7],
  "SP|São José dos Campos":[544.2,567.6],
  "SP|São Paulo":[530.2,578.7],
  "SP|São Roque":[521.3,576.8],
  "SP|Sorocaba":[514.7,575],
  "SP|Taubaté":[552.5,567.5],
  "SP|Vargem Grande Paulista":[523.1,578.2]
};
if(typeof module!=="undefined"&&module.exports){module.exports={CIDADE_XY};}
