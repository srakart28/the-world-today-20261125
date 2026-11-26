# The World Today — Wednesday 25 November 2026

![make.fun competition](https://make.fun/badge/news-image-20261125.svg)
![rank](https://make.fun/badge/news-image-20261125/srakart28/the-world-today-20261125/rank.svg)
![reward](https://make.fun/badge/news-image-20261125/srakart28/the-world-today-20261125/reward.svg)

A one-page newspaper, drawn entirely by code, summing up the world's news of **Wednesday 25 November 2026** in a single 1024×1024 image.

Entry for the make.fun bounty [Sum up 25 November's world news in one image](https://make.fun/bounty/news-image-20261125).

## What it shows

- Hero: Iran says two tankers struck naval mines in the Strait of Hormuz — Brent crude jumps 3.5% to $94.61 (claim labelled as a claim, unconfirmed)
- Shenzhou-24 flies Pakistan's first astronaut to China's space station
- Russian strikes batter Kyiv and Odesa; US proposes tariffs on 14 trading partners
- Houthis claim a strike on Saudi Arabia's Ras Tanura refinery (labelled as a claim)
- Sudan drone strikes kill 19 civilians; Pope Leo XIV laments the COP31 climate talks failure
- Australia and the Solomon Islands sign a security treaty
- "Around the World in 25 November": 27 further dated stories across 8 regions, plus the day's market closes and all nine Champions League results

## How it works

`main.ts` (Node 22, no dependencies, no network) renders the page with its own software rasteriser and baked font glyphs, and writes `/output/entry.png`. The output is deterministic: every run produces byte-identical PNG output (1024×1024, ~228 KB).

## License

MIT
