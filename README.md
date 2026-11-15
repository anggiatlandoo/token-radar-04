# token-radar-04

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/anggiatlandoo/token-radar-04/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/anggiatlandoo/token-radar-04/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Dilution radar: the expected slice, discounted by the crowd. A protocol's implied value means little if two million farmers are splitting it — so this board ranks by the diluted expected value: probability of launch × value if launched ÷ crowd factor.

The crowd is estimated from the snapshot itself: farmers ≈ TVL ÷ a $1,000 ticket, against the board-median crowd of 22,591 farmers. The median protocol is diluted ×2.00, the 90th percentile ×10.36, the worst ×123.07. Sentora Curator, the field's top expected value at $38.0M, dilutes to $0.3M — 2,757,586 farmers share its slice. Steakhouse Financial dilutes ×122.91, Gauntlet ×70.84. The top of the diluted board is Plasma One ($2.78M), Kava Mint ($2.71M) and Set Protocol ($2.70M).

The value model is fitted, not hand-tuned: a log-log size curve (log10(mcap) = 3.3823 + 0.4721 × log10(TVL), R² 0.14, 119 live-token comps) gives the value if a protocol launches; an empirical launch-probability table (age × TVL, shrinkage k=2 picked by holdout, MAE 0.139) gives the probability it launches. A 3-way age × TVL × category table was tested and dropped — its cells are too thin (holdout MAE 0.173). Validated out of sample (LOO median miss ×3.36; time-split ×3.15). Growth, age and curvature were tested as fitted terms and dropped.

The verdicts are SKIP-heavy on purpose: ROBUST 7 / FARM 17 / THIN 47 / SKIP 127 at a $1,000 tier — crowd plus gas make $1,000 farming a loser for most protocols, and the board says so. At a $5,000 tier 38 rows reach FARM or better and 5 reach ROBUST. The crowd lab shows the sensitivity live: doubling the crowd kills 6 of the 7 ROBUST rows. Each farm plan carries a crowd-risk step, and the walk-away is the fall in launch value that takes the $1,000-tier net to zero.

Board: 198 rows (the full 40-protocol watchlist plus 158 rankable protocols), with the whole snapshot accounted for (198 ranked + 144 set aside with reasons + 416 already trading = 758).

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=4gqgrk6n&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
