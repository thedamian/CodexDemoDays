# OpenAI DevDay 2026 — presentation

Static HTML slide deck. No build step. Open `index.html` in a browser (or `npx serve .`).

## Files
- `index.html` — the whole deck: slide markup + deck CSS in a `<style>` block in `<head>`.
- `deck-stage.js` — `<deck-stage>` web component: 1920×1080 scaling, ←/→ keyboard nav, thumbnail rail, print-to-PDF (one page per slide). Don't edit unless changing deck behaviour.
- `ds-base.js` — loads the design-system bundle.
- `_ds/modernist-…/styles.css` — Modernist design system tokens + components. Read `_ds/modernist-…/readme.md` for the rules.

## Structure
- Each slide is a `<section class="slide …" data-label="…">` inside `<deck-stage>`. Don't set position/size on sections — the stage does that.
- Slide types: `.cover` (title/close), `.content` + `.quad` (headlines 2×2), `.topic` (one feature per slide), `.topic.fav` (demo favourites — tinted background + "Live demo" flag).
- Topic slide: `.kicker` (counter · group), `.topic-title` (linked to official page, Lucide arrow-up-right icon), `.topic-line` (one sentence), `.avail` (availability row).
- Every slide starts with a `.theme-toggle` button. `toggleTheme()` flips `html[data-theme]` between light/dark and saves to `localStorage['devday-theme']`. Dark mode = token overrides under `html[data-theme="dark"]`.

## Design rules (Modernist)
- Archivo only, flush left, zero radius, 2px rules (`--color-divider`), single red accent used sparingly.
- Colors/fonts only from `var(--color-*)` / `var(--font-*)`; accent text on light ground uses `--color-accent-700`, on dark `--color-accent-400`.
- Type sizes via deck vars (`--type-title`, `--type-body`, `--type-small`, `--type-kicker`); nothing below 24px.
- Icons: Lucide, inline SVG, `stroke="currentColor"`.

## Content notes
- Source: https://openai.com/index/devday-2026-recap/
- Decisions API has no dedicated page yet — links to the recap.
- "Plugins hosted in your Repo" links to https://developers.openai.com/plugins (name not used verbatim by OpenAI).
- Close slide still has placeholder `you@example.com`.
