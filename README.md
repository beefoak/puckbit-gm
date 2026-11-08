# PuckBit GM

A pixel-art pro hockey general manager game, built on the BitBall GM (BitIron) foundation and its beta features. It is a static site: no build step, and saves go to browser localStorage (compressed with lz-string).

## Run it

Serve the folder with any static server and open it in a browser:

```bash
python -m http.server 8791
```

Then open http://localhost:8791.

## What's in it

- **66 seasons of history (1960-2025)** are simulated when you start a league. The original six teams expand, relocate and get renamed following the real league timeline:
  - Hartford → Carolina;
  - Quebec → Colorado;
  - Minnesota → Dallas;
  - Winnipeg → Phoenix/Arizona → Utah;
  - Atlanta → Calgary;
  - Atlanta → Winnipeg;
  - Kansas City → Colorado → New Jersey;
  - the California/Cleveland franchise merged away in 1978.
  - The era rules follow history too: ties, OT loss points, overtime, shootouts and the 2004-05 lockout.
- **Stanley's Mug** champions back to 1960, plus season-by-season standings, brackets, awards and leaders, franchise lineages, franchise leaders, a record book and a Hall of Fame.
- **Live game viewer**: players skate to formation, pass, shoot, chase loose pucks, change lines, kill penalties and pull the goalie. You get speeds from 2x to 40x, a highlights mode, and live tactics (aggression, goalie pull, shorten bench).
- **Hockey players**: C/LW/RW/D/G with skating, shooting, passing, IQ, checking, blocking, faceoff and goalie ratings. Each player has a play style, a nationality-weighted name, aging and potential.
- **Lines editor**: 4 forward lines, 3 D pairs, 2 goalies, PP and PK units, and the starter's share of games.
- **Advanced stats**: CF/CA (Corsi), ixG, GSAx, P/60, TOI, faceoffs, PP/PK, hits, blocks, takeaways and giveaways.
- **Front office**: salary cap with buyouts and dead money, re-signing, 5-day free agency, trades with picks and AI offers, a 7-round draft with lottery and scouting, and an AHL farm team.
- **From the BitBall beta**:
  - coaching staffs (head coach, associate, assistant, goalie coach) with systems, quirks and a coaching carousel;
  - arena operations: pricing, facilities including the ice plant and Zambonis, jersey sales and random events;
  - player morale and pixel portraits.

## Files

| File | What it does |
| --- | --- |
| `js/core.js` | Players, ratings, names, stats helpers |
| `js/teams.js` | Franchises and their eras, league-era rules |
| `js/sim.js` | Game engine (also records keyframes for the viewer) |
| `js/history.js` | 1960-2025 history generator |
| `js/league.js` | Season, playoffs, awards, records, offseason, draft, save/load |
| `js/biz.js` | Cap, contracts, free agency, trades |
| `js/coaches.js`, `js/ops.js`, `js/morale.js`, `js/faces.js` | Beta systems adapted from BitBall |
| `js/rink.js` | Live canvas rink viewer |
| `js/ui*.js`, `js/main.js` | Interface and game flow |

All teams, players and trophies are fictional parodies, not affiliated with any pro league.
