# CODEGA AI Phoenix Visual System

Phoenix visual identity is built around a dark local-first AI cockpit with orange/gold fire, high-contrast panels, living system status, and agent-centered UX.

## Visual keywords

- Dark cockpit
- Phoenix flame
- Local power
- Agent system
- Confidence and diagnostics
- Sınırsız kod, sınırsız güç

## Added renderer assets

- `src/renderer/phoenix-theme.css`
- `src/renderer/phoenix-splash.js`

## Splash sequence

1. Black screen with phoenix glow.
2. Flame mark appears.
3. CODEGA AI Phoenix title locks in.
4. Loader shows kernel activation.
5. Welcome screen appears with agent chips.

## Welcome screen modules

- Phoenix mark
- CODEGA AI Phoenix title
- Local-first motto
- Agent chips: Coder, Reasoner, Planner, Guardian, Executor

## Integration rule

The visual layer must never block the app. If the Phoenix splash or theme fails to load, the existing UI must continue normally.

## Next implementation step

Wire `phoenix-splash.js` into `index.html` after `renderer.js`, or import it from the existing renderer bootstrap. The stylesheet is loaded dynamically by the splash script so the existing `styles.css` remains untouched.
