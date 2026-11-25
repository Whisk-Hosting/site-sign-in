// The whole stylesheet. Served once at /assets/app.css and cached by browsers and the edge.
// Colors are tokens on :root; --accent comes from Settings and everything else mixes from it.
export const css = String.raw`
@font-face { font-family: "Figtree"; font-style: normal; font-weight: 300 900; font-display: swap; src: url(/assets/fonts/figtree-latin-wght-normal.woff2) format("woff2"); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
@font-face { font-family: "Figtree"; font-style: normal; font-weight: 300 900; font-display: swap; src: url(/assets/fonts/figtree-latin-ext-wght-normal.woff2) format("woff2"); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }
@font-face { font-family: "JetBrains Mono"; font-style: normal; font-weight: 400; font-display: swap; src: url(/assets/fonts/jetbrains-mono-latin-400-normal.woff2) format("woff2"); }
@font-face { font-family: "JetBrains Mono"; font-style: normal; font-weight: 600; font-display: swap; src: url(/assets/fonts/jetbrains-mono-latin-600-normal.woff2) format("woff2"); }
:root {
  --bg: #f6f5f1; --surface: #ffffff; --surface-2: #efede7; --ink: #1c1b19; --muted: #67635b;
  --line: #e2dfd7; --line-strong: #ccc7bb; --good: #2f8a57; --bad: #c2392f; --warn: #b7791f;
  --accent: #0f766e; --on-accent: #ffffff;
  --accent-soft: color-mix(in oklab, var(--accent) 13%, transparent);
  --accent-ink: color-mix(in oklab, var(--accent) 80%, var(--ink));
  --shadow: 0 1px 2px rgb(30 25 15 / .06), 0 8px 24px -8px rgb(30 25 15 / .16);
  --shadow-lg: 0 2px 4px rgb(30 25 15 / .05), 0 24px 48px -16px rgb(30 25 15 / .25);
  --radius: 16px; --font: "Figtree", system-ui, sans-serif; --mono: "JetBrains Mono", ui-monospace, monospace;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #111211; --surface: #1a1b1a; --surface-2: #242624; --ink: #eeefea; --muted: #a2a59d;
    --line: #2f312e; --line-strong: #464944; --good: #5cc48a; --bad: #f07167; --warn: #e3b04b;
    --accent-ink: color-mix(in oklab, var(--accent) 60%, white);
    --shadow: 0 1px 2px rgb(0 0 0 / .4), 0 10px 30px -10px rgb(0 0 0 / .7);
    --shadow-lg: 0 2px 4px rgb(0 0 0 / .4), 0 24px 48px -16px rgb(0 0 0 / .8);
    color-scheme: dark;
  }
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 400 17px/1.55 var(--font); -webkit-font-smoothing: antialiased; }
a { color: inherit; }
img { max-width: 100%; }
h1, h2, h3 { line-height: 1.15; letter-spacing: -0.02em; margin: 0 0 .4em; }
h1 { font-size: clamp(1.9rem, 4.2vw, 2.8rem); font-weight: 760; }
h2 { font-size: 1.35rem; font-weight: 700; }
h3 { font-size: 1.1rem; font-weight: 650; }
p { margin: 0 0 1em; }
.icon { flex: none; vertical-align: -0.2em; }
.wrap { max-width: 1180px; margin: 0 auto; padding: 0 24px; }
.muted { color: var(--muted); }
.small { font-size: .875rem; }
.num { font-variant-numeric: tabular-nums; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; border-radius: 6px; }
@media (max-width: 640px) { .wrap { padding: 0 16px; } }

/* Header */
.site-header { border-bottom: 1px solid var(--line); background: color-mix(in oklab, var(--bg) 88%, transparent); backdrop-filter: blur(10px); position: sticky; top: 0; z-index: 10; }
.site-header .wrap { display: flex; align-items: center; gap: 20px; height: 64px; }
.brand { display: flex; align-items: center; gap: 10px; font-weight: 760; font-size: 1.08rem; text-decoration: none; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.brand-dot { width: 14px; height: 14px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 4px var(--accent-soft); flex: none; }
.nav { display: flex; gap: 2px; margin-left: auto; align-items: center; }
.nav a { text-decoration: none; padding: 8px 12px; border-radius: 10px; color: var(--muted); font-weight: 560; font-size: .95rem; display: inline-flex; gap: 7px; align-items: center; white-space: nowrap; }
.nav a:hover, .nav a[aria-current] { color: var(--ink); background: var(--surface-2); }
.nav .count-pill { background: var(--accent); color: var(--on-accent); }
@media (max-width: 860px) { .nav a span.label { display: none; } .site-header .wrap { gap: 10px; } .nav a { padding: 9px 10px; } }
.demo-bar { background: var(--ink); color: var(--bg); font-size: .85rem; text-align: center; padding: 7px 16px; }
.demo-bar a { color: inherit; font-weight: 650; }

/* Buttons and badges */
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; border: 1px solid var(--line-strong); background: var(--surface); color: var(--ink); font: 620 .95rem/1 var(--font); padding: 12px 18px; border-radius: 12px; text-decoration: none; cursor: pointer; transition: transform .12s, box-shadow .12s, background .12s; white-space: nowrap; }
.btn:hover { transform: translateY(-1px); box-shadow: var(--shadow); }
.btn:active { transform: none; }
.btn.primary { background: var(--accent); border-color: transparent; color: var(--on-accent); }
.btn.alarm { background: var(--bad); border-color: transparent; color: #fff; }
.btn.ghost { background: transparent; border-color: transparent; }
.btn.ghost:hover { background: var(--surface-2); box-shadow: none; }
.btn.small { padding: 8px 12px; font-size: .85rem; border-radius: 10px; }
.btn.danger { color: var(--bad); }
.btn.wide { width: 100%; }
.btn[disabled] { opacity: .5; pointer-events: none; }
.badge { display: inline-flex; align-items: center; gap: 5px; font: 650 .7rem/1 var(--font); text-transform: uppercase; letter-spacing: .06em; padding: 5px 8px; border-radius: 999px; background: var(--surface-2); color: var(--muted); white-space: nowrap; }
.badge .icon { width: 12px; height: 12px; }
.badge.accent { background: var(--accent); color: var(--on-accent); }
.badge.soft { background: var(--accent-soft); color: var(--accent-ink); }
.badge.good { background: color-mix(in oklab, var(--good) 16%, transparent); color: var(--good); }
.badge.warn { background: color-mix(in oklab, var(--warn) 18%, transparent); color: var(--warn); }
.badge.bad { background: color-mix(in oklab, var(--bad) 14%, transparent); color: var(--bad); }
.count-pill { background: var(--surface-2); border-radius: 99px; padding: 2px 8px; font-size: .75rem; font-weight: 700; line-height: 1.3; }
.row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.spread { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
.icon-btn { display: inline-grid; place-items: center; width: 38px; height: 38px; border-radius: 10px; border: 1px solid transparent; background: transparent; color: var(--muted); cursor: pointer; padding: 0; text-decoration: none; }
.icon-btn:hover { background: var(--surface-2); color: var(--ink); border-color: var(--line); }
.icon-btn .icon { width: 18px; height: 18px; }
.inline { display: inline; margin: 0; }

/* Page heads */
.page-head { padding: 40px 0 24px; display: flex; gap: 16px; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; }
.page-head h1 { margin: 0; }
.page-head .kicker { color: var(--accent-ink); font-weight: 650; font-size: .9rem; margin-bottom: 6px; display: flex; gap: 6px; align-items: center; }
.segmented { display: inline-flex; width: fit-content; max-width: 100%; overflow-x: auto; border: 1px solid var(--line-strong); border-radius: 12px; padding: 3px; gap: 3px; background: var(--surface); }
.segmented a, .segmented span.opt { display: block; padding: 8px 14px; border-radius: 9px; font-weight: 620; font-size: .9rem; color: var(--muted); text-decoration: none; white-space: nowrap; }
.segmented a[aria-current] { background: var(--accent); color: var(--on-accent); }
.segmented label { margin: 0; }
.segmented input { position: absolute; opacity: 0; pointer-events: none; }
.segmented input + span { display: block; padding: 8px 14px; border-radius: 9px; font-weight: 620; font-size: .9rem; cursor: pointer; color: var(--muted); }
.segmented input:checked + span { background: var(--accent); color: var(--on-accent); }
.segmented input:focus-visible + span { outline: 3px solid var(--accent); outline-offset: 2px; }

/* On site now */
.board { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 28px; padding-bottom: 72px; align-items: start; }
@media (max-width: 960px) { .board { grid-template-columns: 1fr; } }
.stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 24px; }
@media (max-width: 640px) { .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.stat { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 16px 18px; }
.stat b { display: block; font-size: 2rem; font-weight: 760; letter-spacing: -0.02em; line-height: 1.1; font-variant-numeric: tabular-nums; }
.stat span { color: var(--muted); font-size: .85rem; font-weight: 560; }
.stat.lead { background: var(--accent); border-color: transparent; color: var(--on-accent); }
.stat.lead span { color: inherit; opacity: .85; }
.people { display: grid; gap: 10px; }
.who { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 14px; align-items: center; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 12px 14px; transition: border-color .15s, box-shadow .15s; }
.who:hover { border-color: var(--line-strong); box-shadow: var(--shadow); }
.who.flagged { border-color: color-mix(in oklab, var(--bad) 45%, var(--line)); }
.who .name { font-weight: 680; text-decoration: none; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.who .name:hover { color: var(--accent-ink); }
.who .sub { color: var(--muted); font-size: .88rem; display: flex; gap: 6px 12px; flex-wrap: wrap; align-items: center; margin-top: 2px; }
.who .sub span { display: inline-flex; gap: 5px; align-items: center; }
.who .sub .icon { width: 14px; height: 14px; }
.who .when { text-align: right; font-size: .85rem; color: var(--muted); display: flex; gap: 10px; align-items: center; }
.who .when b { color: var(--ink); font-weight: 650; display: block; font-variant-numeric: tabular-nums; }
@media (max-width: 560px) { .who { grid-template-columns: auto minmax(0, 1fr); } .who .when { grid-column: 1 / -1; justify-content: space-between; text-align: left; border-top: 1px solid var(--line); padding-top: 10px; } }
.avatar { width: 46px; height: 46px; border-radius: 50%; display: grid; place-items: center; font-weight: 700; font-size: .95rem; background: var(--accent-soft); color: var(--accent-ink); overflow: hidden; flex: none; }
.avatar img { width: 100%; height: 100%; object-fit: cover; }
.avatar.staff { background: var(--surface-2); color: var(--muted); }
.avatar.contractor { background: color-mix(in oklab, var(--warn) 18%, transparent); color: var(--warn); }
.avatar.big { width: 88px; height: 88px; font-size: 1.6rem; }
.group-head { display: flex; justify-content: space-between; align-items: baseline; margin: 26px 0 10px; }
.group-head:first-child { margin-top: 0; }
.group-head h2 { font-size: 1.05rem; margin: 0; }
.side { display: grid; gap: 18px; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 20px; }
.card h2 { font-size: 1.05rem; display: flex; gap: 8px; align-items: center; }
.card.alarm { border-color: color-mix(in oklab, var(--bad) 35%, var(--line)); background: color-mix(in oklab, var(--bad) 5%, var(--surface)); }
.card.alarm h2 { color: var(--bad); }
.mini { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
.mini li { display: flex; gap: 10px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--line); }
.mini li:last-child { border-bottom: 0; }
.mini .grow { flex: 1; min-width: 0; }
.mini .grow b { display: block; font-weight: 640; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mini .grow small { color: var(--muted); }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--line-strong); flex: none; }
.dot.live { background: var(--good); box-shadow: 0 0 0 4px color-mix(in oklab, var(--good) 20%, transparent); }

/* Roll call */
.roll-head { position: sticky; top: 64px; z-index: 5; background: var(--bg); padding: 18px 0 14px; border-bottom: 1px solid var(--line); margin-bottom: 16px; }
.meter { height: 12px; border-radius: 99px; background: color-mix(in oklab, var(--bad) 18%, var(--surface-2)); overflow: hidden; margin: 12px 0 0; }
.meter i { display: block; height: 100%; background: var(--good); border-radius: 99px; transition: width .4s cubic-bezier(.2,.8,.2,1); }
.roll { display: grid; gap: 8px; padding-bottom: 80px; }
.roll form { margin: 0; }
.roll button.tap { width: 100%; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 14px; align-items: center; text-align: left; font: inherit; color: inherit; background: var(--surface); border: 2px solid var(--line); border-radius: 16px; padding: 14px 16px; cursor: pointer; transition: border-color .15s, background .15s; }
.roll button.tap b { display: block; font-size: 1.08rem; }
.roll button.tap small { color: var(--muted); }
.roll .state { width: 34px; height: 34px; border-radius: 50%; border: 2px solid var(--line-strong); display: grid; place-items: center; color: transparent; }
.roll .safe button.tap { border-color: color-mix(in oklab, var(--good) 55%, var(--line)); background: color-mix(in oklab, var(--good) 7%, var(--surface)); }
.roll .safe .state { background: var(--good); border-color: var(--good); color: #fff; }
.big-count { font-size: clamp(2.4rem, 8vw, 3.6rem); font-weight: 780; letter-spacing: -0.03em; line-height: 1; font-variant-numeric: tabular-nums; }

/* Tables, forms, notices */
.notice { padding: 14px 18px; border-radius: 12px; background: var(--surface-2); margin: 0 0 20px; display: flex; gap: 10px; align-items: flex-start; }
.notice.error { background: color-mix(in oklab, var(--bad) 12%, transparent); }
.notice.good { background: color-mix(in oklab, var(--good) 13%, transparent); }
.notice.warn { background: color-mix(in oklab, var(--warn) 15%, transparent); }
.empty { text-align: center; padding: 56px 24px; border: 2px dashed var(--line); border-radius: 20px; color: var(--muted); }
.empty .icon { width: 34px; height: 34px; color: var(--line-strong); margin-bottom: 8px; }
.empty h2 { color: var(--ink); font-size: 1.15rem; }
.empty.small { padding: 24px 16px; }
.panel { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 24px; }
.table { width: 100%; border-collapse: collapse; font-size: .94rem; }
.table th { text-align: left; font-weight: 620; color: var(--muted); font-size: .76rem; text-transform: uppercase; letter-spacing: .05em; padding: 10px 12px; border-bottom: 1px solid var(--line); white-space: nowrap; }
.table td { padding: 11px 12px; border-bottom: 1px solid var(--line); vertical-align: middle; }
.table tr:last-child td { border-bottom: 0; }
.table td a { text-decoration: none; font-weight: 620; }
.table td a:hover { color: var(--accent-ink); }
.table-wrap { overflow-x: auto; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); }
.field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 18px; }
.field label, .label { font-weight: 620; font-size: .9rem; }
.field .hint { color: var(--muted); font-size: .82rem; }
.field .err { color: var(--bad); font-size: .85rem; font-weight: 600; }
.field.bad input, .field.bad select, .field.bad textarea { border-color: var(--bad); }
input[type=text], input[type=email], input[type=tel], input[type=number], input[type=date], input[type=search], input[type=url], textarea, select { font: inherit; font-size: .95rem; color: var(--ink); background: var(--surface); border: 1px solid var(--line-strong); border-radius: 10px; padding: 10px 12px; width: 100%; }
input[type=color] { width: 52px; height: 40px; border: 1px solid var(--line-strong); border-radius: 10px; background: var(--surface); padding: 3px; }
textarea { min-height: 110px; resize: vertical; line-height: 1.55; }
textarea.code { font-family: var(--mono); font-size: .86rem; min-height: 320px; }
input:focus, textarea:focus, select:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.check { display: flex; gap: 10px; align-items: center; font-weight: 560; margin-bottom: 10px; }
.check input { accent-color: var(--accent); width: 18px; height: 18px; flex: none; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 18px; }
.grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0 18px; }
@media (max-width: 640px) { .grid-2, .grid-3 { grid-template-columns: 1fr; } }
.toolbar { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; align-items: flex-end; margin-bottom: 16px; }
.filters { display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-end; margin: 0; }
.filters .field { margin: 0; }
.filters input[type=search] { width: 200px; }
.filters select, .filters input[type=date] { width: auto; }
.stack { display: grid; gap: 20px; max-width: 760px; padding-bottom: 72px; }
.rule { border: 0; border-top: 1px solid var(--line); margin: 24px 0; }
.codeblock { background: var(--surface-2); border-radius: 12px; padding: 14px 16px; overflow-x: auto; font: .8rem/1.6 var(--mono); white-space: pre; }
dl.facts { display: grid; grid-template-columns: max-content 1fr; gap: 10px 20px; margin: 0; }
dl.facts dt { color: var(--muted); font-size: .9rem; }
dl.facts dd { margin: 0; font-weight: 560; }
.sig { background: #fff; border: 1px solid var(--line); border-radius: 10px; width: 220px; height: 80px; display: block; }
.sig path { fill: none; stroke: #1c1b19; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
.tabs { display: flex; gap: 4px; margin-bottom: 20px; flex-wrap: wrap; border-bottom: 1px solid var(--line); }
.tabs a { font: 620 .92rem var(--font); padding: 10px 14px; color: var(--muted); text-decoration: none; border-bottom: 2px solid transparent; margin-bottom: -1px; display: inline-flex; gap: 7px; align-items: center; }
.tabs a .icon { width: 16px; height: 16px; }
.tabs a[aria-current] { color: var(--ink); border-color: var(--accent); }
.list-card { display: grid; gap: 0; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; }
.list-card > a, .list-card > div { display: flex; gap: 14px; align-items: center; padding: 14px 18px; border-bottom: 1px solid var(--line); text-decoration: none; }
.list-card > :last-child { border-bottom: 0; }
.list-card > a:hover { background: var(--surface-2); }
.list-card .grow { flex: 1; min-width: 0; }
.list-card .grow b { display: block; font-weight: 650; }
.list-card .grow small { color: var(--muted); }
.type-ico { width: 40px; height: 40px; border-radius: 12px; background: var(--accent-soft); color: var(--accent-ink); display: grid; place-items: center; flex: none; }
.ed-question { border: 1px solid var(--line); border-radius: 14px; padding: 18px; margin-bottom: 14px; background: var(--surface); }
.ed-choice { display: flex; gap: 10px; align-items: center; margin-bottom: 8px; }
.ed-choice input[type=radio] { accent-color: var(--good); width: 18px; height: 18px; flex: none; }
.icon-pick { display: flex; gap: 6px; flex-wrap: wrap; }
.icon-pick label { margin: 0; }
.icon-pick input { position: absolute; opacity: 0; }
.icon-pick span { width: 44px; height: 44px; display: grid; place-items: center; border-radius: 12px; border: 1px solid var(--line-strong); color: var(--muted); cursor: pointer; }
.icon-pick input:checked + span { border-color: var(--accent); background: var(--accent-soft); color: var(--accent-ink); }
.icon-pick input:focus-visible + span { outline: 3px solid var(--accent); outline-offset: 2px; }
.qr-box { display: grid; grid-template-columns: 148px 1fr; gap: 18px; align-items: center; }
.qr svg { width: 100%; height: auto; display: block; background: #fff; border-radius: 10px; padding: 8px; }
@media (max-width: 520px) { .qr-box { grid-template-columns: 1fr; } .qr-box > :first-child { max-width: 180px; } }
.copyfield { display: flex; gap: 8px; }
.copyfield input { font-family: var(--mono); font-size: .8rem; }
.pair-code { font: 700 2.4rem/1 var(--mono); letter-spacing: .14em; }
.media-frame { aspect-ratio: 16 / 9; border-radius: 14px; overflow: hidden; background: #000; margin: 0 0 20px; }
.media-frame whisk-video { display: block; width: 100%; height: 100%; }
.upload-box { border: 2px dashed var(--line-strong); border-radius: 14px; padding: 18px; text-align: center; }
.bar { height: 8px; border-radius: 99px; background: var(--surface-2); overflow: hidden; margin-top: 10px; }
.bar > i { display: block; height: 100%; width: 0; background: var(--accent); border-radius: 99px; transition: width .3s; }
.prose { max-width: 68ch; }
.prose h2 { margin-top: 1.6em; font-size: 1.25rem; }
.prose h3 { margin-top: 1.4em; }
.prose a { color: var(--accent-ink); text-underline-offset: 3px; }
.prose ul, .prose ol { padding-left: 1.3em; margin: 0 0 1em; }
.prose li { margin: .35em 0; }
.prose blockquote { margin: 1.4em 0; padding: 14px 18px; border-radius: 12px; background: var(--accent-soft); }
.prose img { border-radius: 12px; }
footer.site { border-top: 1px solid var(--line); padding: 28px 0 40px; color: var(--muted); font-size: .85rem; }

/* Demo landing */
.demo-hero { padding: 12vh 24px 80px; max-width: 760px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 12px; }
.demo-hero h1 { font-size: clamp(2.4rem, 7vw, 4rem); margin: 8px 0 0; }
.demo-hero .lead { font-size: 1.2rem; color: var(--muted); }
.demo-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; width: 100%; margin: 20px 0 12px; }
.demo-actions form { margin: 0; }
.demo-card { width: 100%; height: 100%; text-align: left; font: inherit; color: inherit; background: var(--surface); border: 1px solid var(--line); border-radius: 20px; padding: 26px; cursor: pointer; display: flex; flex-direction: column; gap: 6px; transition: transform .15s, box-shadow .15s, border-color .15s; }
.demo-card:hover { transform: translateY(-3px); box-shadow: var(--shadow-lg); border-color: var(--accent); }
.demo-card b { font-size: 1.25rem; }
.demo-card span { color: var(--muted); }
@media (max-width: 560px) { .demo-actions { grid-template-columns: 1fr; } }

/* ----- The kiosk and the visitor's phone ----- */
body.kiosk { min-height: 100dvh; background: radial-gradient(120% 80% at 100% 0%, var(--accent-soft), transparent 60%), var(--bg); font-size: 19px; overflow-x: hidden; }
.k-top { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 22px clamp(20px, 4vw, 48px); }
.k-top .brand { font-size: 1.2rem; }
.k-top .where { color: var(--muted); font-weight: 560; display: flex; gap: 6px; align-items: center; font-size: .95rem; }
.k-main { width: min(100% - 40px, 880px); margin: 0 auto; padding: 2vh 0 48px; }
.k-main.narrow { width: min(100% - 32px, 640px); }
.k-steps { display: flex; gap: 6px; margin-bottom: 26px; }
.k-steps i { height: 5px; flex: 1; border-radius: 99px; background: var(--line); }
.k-steps i.on { background: var(--accent); }
.k-title { font-size: clamp(2rem, 5vw, 3rem); font-weight: 780; letter-spacing: -0.025em; margin: 0 0 8px; }
.k-sub { color: var(--muted); font-size: 1.1rem; margin-bottom: 28px; }
.k-welcome { min-height: calc(100dvh - 90px); display: flex; flex-direction: column; justify-content: center; gap: 28px; padding-bottom: 40px; }
.k-clock { font-size: 1.05rem; font-weight: 600; color: var(--muted); font-variant-numeric: tabular-nums; }
.k-hello { font-size: clamp(2.8rem, 8vw, 5.4rem); font-weight: 800; letter-spacing: -0.035em; line-height: 1; margin: 0; }
.k-big { display: grid; grid-template-columns: 1.4fr 1fr; gap: 18px; }
@media (max-width: 640px) { .k-big { grid-template-columns: 1fr; } }
.k-btn { display: flex; flex-direction: column; justify-content: space-between; gap: 34px; min-height: 190px; padding: 28px; border-radius: 28px; text-decoration: none; background: var(--surface); border: 1px solid var(--line); box-shadow: var(--shadow); transition: transform .15s, box-shadow .15s; font: inherit; color: inherit; cursor: pointer; text-align: left; width: 100%; }
.k-btn:active { transform: scale(.985); }
.k-btn:hover { box-shadow: var(--shadow-lg); }
.k-btn .icon { width: 40px; height: 40px; stroke-width: 1.8; }
.k-btn b { font-size: clamp(1.7rem, 3.4vw, 2.3rem); letter-spacing: -0.02em; line-height: 1.1; display: block; }
.k-btn small { font-size: 1rem; color: var(--muted); }
.k-btn.primary { background: var(--accent); color: var(--on-accent); border-color: transparent; }
.k-btn.primary small { color: inherit; opacity: .85; }
.k-links { display: flex; gap: 10px; flex-wrap: wrap; }
.k-pill { display: inline-flex; gap: 8px; align-items: center; padding: 14px 20px; border-radius: 999px; background: var(--surface); border: 1px solid var(--line); text-decoration: none; font-weight: 620; font-size: 1rem; }
.k-pill:hover { border-color: var(--line-strong); }
.k-foot { display: grid; grid-template-columns: 1fr auto; gap: 24px; align-items: end; color: var(--muted); font-size: .9rem; }
.k-foot .qr-img { width: 104px; text-align: center; font-size: .78rem; font-weight: 600; }
.k-foot p { margin: 0; max-width: 46ch; }
.k-types { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 14px; }
.k-type { display: flex; flex-direction: column; gap: 18px; padding: 24px; min-height: 160px; border-radius: 24px; background: var(--surface); border: 1px solid var(--line); text-decoration: none; box-shadow: var(--shadow); transition: transform .15s, border-color .15s; font: inherit; color: inherit; text-align: left; cursor: pointer; }
.k-type:hover { border-color: var(--accent); }
.k-type:active { transform: scale(.98); }
.k-type .type-ico { width: 56px; height: 56px; border-radius: 18px; }
.k-type .type-ico .icon { width: 28px; height: 28px; }
.k-type b { font-size: 1.35rem; margin-top: auto; }
@media (max-width: 560px) { .k-types { grid-template-columns: 1fr; gap: 10px; } .k-type { flex-direction: row; align-items: center; min-height: 0; padding: 16px 18px; border-radius: 20px; } .k-type b { margin-top: 0; font-size: 1.2rem; } .k-type .type-ico { width: 48px; height: 48px; border-radius: 14px; } }
.k-form .field label { font-size: 1rem; }
.k-form input[type=text], .k-form input[type=email], .k-form input[type=tel], .k-form select, .k-form textarea { font-size: 1.2rem; padding: 16px 18px; border-radius: 14px; border-width: 1.5px; }
.k-form textarea { min-height: 90px; }
.k-actions { display: flex; gap: 12px; justify-content: space-between; align-items: center; margin-top: 28px; }
.k-actions > span:empty { display: none; }
.k-actions > span:empty + * { margin-left: auto; }
.k-actions .btn { padding: 18px 28px; font-size: 1.1rem; border-radius: 16px; }
.k-actions .btn.primary { min-width: 200px; }
.k-back { display: inline-flex; gap: 8px; align-items: center; color: var(--muted); text-decoration: none; font-weight: 600; padding: 10px 0; }
.k-card { background: var(--surface); border: 1px solid var(--line); border-radius: 24px; padding: clamp(20px, 4vw, 36px); box-shadow: var(--shadow); }
.k-card + .k-card { margin-top: 16px; }
.k-card .prose { font-size: 1.08rem; max-width: none; }
.choice { display: flex; gap: 14px; align-items: center; padding: 16px 18px; border: 1.5px solid var(--line); border-radius: 14px; margin-top: 10px; cursor: pointer; transition: border-color .15s, background .15s; font-size: 1.08rem; }
.choice:hover { border-color: var(--line-strong); }
.choice input { accent-color: var(--accent); width: 22px; height: 22px; flex: none; }
.choice:has(input:checked) { border-color: var(--accent); background: var(--accent-soft); }
.choice.wrong { border-color: var(--bad); background: color-mix(in oklab, var(--bad) 8%, transparent); }
.question { border: 0; padding: 0; margin: 0 0 28px; min-width: 0; }
.question legend { font-weight: 700; font-size: 1.15rem; padding: 0; margin-bottom: 4px; }
.question .qn { color: var(--accent-ink); font-size: .85rem; font-weight: 700; display: block; margin-bottom: 4px; }
.sigpad { position: relative; border: 2px dashed var(--line-strong); border-radius: 18px; background: #fff; touch-action: none; height: 220px; }
.sigpad canvas { width: 100%; height: 100%; display: block; border-radius: 16px; cursor: crosshair; }
.sigpad .hintline { position: absolute; left: 24px; right: 24px; bottom: 54px; border-bottom: 1.5px solid #d7d2c6; pointer-events: none; }
.sigpad .placeholder { position: absolute; left: 24px; bottom: 22px; color: #9a958a; font-size: .95rem; pointer-events: none; }
.sigpad.signed .placeholder { display: none; }
.sigpad button { position: absolute; top: 10px; right: 10px; }
.camera { position: relative; width: min(100%, 420px); aspect-ratio: 1; margin: 0 auto 18px; border-radius: 50%; overflow: hidden; background: var(--surface-2); box-shadow: 0 0 0 8px var(--accent-soft); display: grid; place-items: center; color: var(--muted); }
.camera video, .camera img { width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1); }
.camera img { transform: none; }
.done { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 6vh 0 40px; }
.done .tick { width: 120px; height: 120px; border-radius: 50%; background: var(--accent); color: var(--on-accent); display: grid; place-items: center; box-shadow: 0 0 0 14px var(--accent-soft); animation: pop .5s cubic-bezier(.2,1.4,.4,1) both; }
.done .tick .icon { width: 58px; height: 58px; stroke-width: 2.6; }
.done .tick.out { background: var(--surface-2); color: var(--ink); box-shadow: 0 0 0 14px var(--surface-2); }
.done .tick.stop { background: var(--bad); box-shadow: 0 0 0 14px color-mix(in oklab, var(--bad) 18%, transparent); }
@keyframes pop { from { transform: scale(.4); opacity: 0; } }
.done .k-title { margin-top: 18px; }
.countdown { color: var(--muted); font-size: .95rem; }
.k-results { display: grid; gap: 10px; margin-top: 18px; }
.k-results button { display: flex; align-items: center; gap: 16px; width: 100%; padding: 16px 18px; border-radius: 16px; border: 1px solid var(--line); background: var(--surface); font: inherit; color: inherit; text-align: left; cursor: pointer; }
.k-results button:hover { border-color: var(--accent); }
.k-results b { font-size: 1.2rem; }
.k-results .grow { flex: 1; }
.code-input { font: 700 2.4rem/1 var(--mono) !important; letter-spacing: .3em; text-align: center; }
.badge-preview { width: 100%; max-width: 380px; margin: 0 auto; }
.k-note { display: flex; gap: 12px; align-items: flex-start; padding: 16px 18px; border-radius: 16px; background: var(--surface); border: 1px solid var(--line); text-align: left; }
.k-note.warn { background: color-mix(in oklab, var(--warn) 12%, var(--surface)); border-color: color-mix(in oklab, var(--warn) 40%, var(--line)); }
.k-note .icon { color: var(--warn); margin-top: 2px; }
body.phone .k-top { padding: 16px 20px; }
body.phone .k-main { width: min(100% - 32px, 560px); }
body.phone .k-title { font-size: 2rem; }
body.phone .k-actions .btn.primary { flex: 1; }

/* Badge: printed on a label printer (62 × 100 mm), or shown on a phone. */
.vbadge { background: #fff; color: #1c1b19; border-radius: 18px; border: 1px solid var(--line); box-shadow: var(--shadow); overflow: hidden; aspect-ratio: 62 / 100; display: flex; flex-direction: column; }
.vbadge .band { background: var(--accent); color: var(--on-accent); padding: 8% 9%; font-weight: 800; font-size: clamp(1rem, 4.4vw, 1.5rem); letter-spacing: .06em; text-transform: uppercase; }
.vbadge .body { padding: 9%; display: flex; flex-direction: column; gap: 4px; flex: 1; }
.vbadge .nm { font-size: clamp(1.6rem, 7vw, 2.4rem); font-weight: 800; line-height: 1.05; letter-spacing: -0.02em; margin-top: 6%; }
.vbadge .co { font-size: 1.05rem; color: #5d5a54; font-weight: 600; }
.vbadge .meta { margin-top: auto; font-size: .9rem; color: #5d5a54; display: grid; gap: 2px; }
.vbadge .meta b { color: #1c1b19; }
.vbadge .ph { width: 34%; aspect-ratio: 1; border-radius: 12px; object-fit: cover; }
@media print {
  @page { size: 62mm 100mm; margin: 0; }
  body * { visibility: hidden; }
  .print-me, .print-me * { visibility: visible; }
  .print-me { position: fixed; inset: 0; width: 62mm; height: 100mm; border: 0; border-radius: 0; box-shadow: none; }
}
/* The QR poster, printed on A4 for the site entrance. */
.poster { background: #fff; color: #1c1b19; max-width: 720px; margin: 0 auto 60px; border-radius: 20px; border: 1px solid var(--line); padding: 56px; text-align: center; box-shadow: var(--shadow); }
.poster .brand { justify-content: center; font-size: 1.3rem; }
.poster h1 { font-size: 3rem; margin: 28px 0 8px; }
.poster .qr { width: 62%; margin: 32px auto; }
.poster .qr svg { padding: 0; }
.poster p { font-size: 1.2rem; color: #5d5a54; }
body.print-poster .site-header, body.print-poster footer.site, body.print-poster .no-print { display: none; }
@media print { body.print-poster .poster { border: 0; box-shadow: none; padding: 20mm; max-width: none; } body.print-poster { background: #fff; } body.print-poster * { visibility: visible; } }

.menu { position: relative; }
.menu > summary { list-style: none; }
.menu > summary::-webkit-details-marker { display: none; }
.menu-body { box-shadow: 0 12px 32px rgb(0 0 0 / .14); padding: 12px; }

@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
`;
