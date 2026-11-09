# Precisari — assets para implementação

Identidade: símbolo azul profundo e tipografia tangerina. Este pacote contém imagens independentes geradas para uso na implementação, sem extrair fotografias das telas. A pasta de referências mantém os mockups para comparação visual.

## Comece por aqui

1. Use `01_Logos_PNG_4K/logo-principal-4k.png` sobre superfícies claras. Preserve proporção e transparência.
2. Use `logo-negativa-tangerina` sobre azul profundo. As versões monocromáticas servem para aplicações de uma cor. O símbolo isolado serve para avatares e ícones.
3. Use as fotos de `02_Fotografias_PNG_4K` como assets separados; textos, calendário, botões e painéis devem ser componentes reais.

## Arquivos e aplicações

| Asset | Aplicação | Fundo |
|---|---|---|
| logo-principal | Cabeçalho da landing e do app | Transparente; aplicar sobre claro |
| logo-negativa-tangerina | Cabeçalhos e rodapés escuros | Transparente; aplicar sobre marinho |
| logo-monocromatica-marinho | Documentos e aplicações de uma cor | Transparente |
| logo-monocromatica-branca | Versão negativa de uma cor | Transparente; aplicar sobre escuro |
| simbolo-marinho | Ícone, avatar, splash | Transparente |
| hero-apartamento-litoral | Imagem principal da landing | Fotografia completa |
| imovel-studio-campeche | Seletor/lista de imóveis e exemplo de onboarding | Fotografia completa |
| destino-campeche | Contexto do destino e materiais de divulgação | Fotografia completa |

## Resoluções e formatos

- Todos os masters entregues nas pastas 01 e 02 têm **4096 px no lado maior**, mantendo a proporção de geração. `4K` aqui é o tamanho da exportação, não promessa de geração nativa em 4K.
- Quando a geração original teve resolução inferior, a exportação foi ampliada com reamostragem Lanczos. Isso não acrescenta detalhe nativo. Dimensões originais, dimensões finais e fator de ampliação estão em `resolucoes.json`.
- `07_Originais_Geracao` contém os PNGs nativos sem ampliação.
- Logos e símbolo: PNG RGBA transparente. Fotos: PNG RGB. Os ícones do app têm fundo marfim opaco para uso nas plataformas.
- `04_PNG_Otimizados`: cópias com até 1600 px para reduzir tráfego. Use tamanhos adequados à área exibida em vez de carregar os masters de 4K em todos os lugares.
- As variações são masters raster gerados por IA e podem apresentar pequenas diferenças de contorno. O arquivo principal é a referência desta entrega. Não são vetores nem arquivos de fonte.
- As fotos são ilustrativas geradas por IA; não representam um anúncio, imóvel real ou documentação geográfica do destino.

## Paleta e contraste

| Papel | HEX |
|---|---|
| Azul profundo | #162B49 |
| Tangerina | #FF8845 |
| Marfim | #F7F5F0 |
| Superfície | #FFFFFF |
| Texto secundário | #556171 |
| Positivo | #17633F |

Aplicar o CSS de `design-tokens.css`. No botão tangerina, usar texto marinho. Reservar tangerina para destaques; textos longos e números pequenos devem usar marinho. Conferir contrastes após definir tamanhos e pesos finais.

## Implementação web e nativa

- Landing: hero com `object-fit: cover`; sobrepor o calendário como interface real. A dobra diagonal e o recorte arquitetônico são máscaras CSS, não precisam ficar embutidos na fotografia.
- Imóveis: usar a foto `imovel-studio-campeche` no seletor e na ficha ilustrativa. No produto em produção, substituir pela foto autorizada do imóvel do anfitrião.
- Header: logo com `object-fit: contain`, largura aproximada de 150–190 CSS px no desktop e 120–155 CSS px no mobile, sem esticar.
- App nativo: ícone de loja em 1024 px e demais tamanhos na pasta 03. A configuração final e geração de ícones/splash devem ser feitas pelo Expo/EAS com os requisitos vigentes de cada plataforma.
- Favorito do navegador: favicon.ico ou app-icon-32.png. Apple touch icon: app-icon-180.png. PWA: 192 e 512 px. Não declarar estes ícones como maskable sem validar o recorte da plataforma.
- Ícones de interface: usar Lucide (`CalendarDays`, `Bell`, `House`, `ChartNoAxesCombined`, `Settings`, `ChevronRight`, `ArrowUpRight`, `Sun`, `CloudSun`, `ShieldCheck`, `Copy`, `ExternalLink`). Não usar pequenas imagens de ícones extraídas dos mockups.
- Tipografia da UI recomendada: Manrope para títulos e Inter para corpo/números. Obter de seus projetos oficiais e verificar as licenças. O lettering da logo já está desenhado no PNG; não reconstruir digitando uma fonte semelhante.
- O calendário-mapa de calor precisa de data, preço, legenda e estado por texto/ícone; nunca depender só da cor.
- Aprovação no MVP não atualiza preço no Airbnb automaticamente: manter o fluxo de revisar, copiar e abrir Airbnb.

## Preservação da marca

Não deformar, girar ou alterar a divisão central do símbolo. Não substituir por iniciais ou outros pictogramas. Reservar espaço livre ao redor equivalente a pelo menos metade da altura das letras. Para favicon e reduções, usar apenas o símbolo. Evitar sombras e gradientes adicionados à logo.

## Referências e conteúdo demonstrativo

Os três mockups estão em `05_Referencias`. São direção visual, não telas implementadas. Textos de plano, datas, estatísticas e funcionalidades dos mockups precisam ser conferidos contra o PRD antes da implementação; a documentação do produto prevalece. Exemplos de preços e ganhos não são resultados reais.
