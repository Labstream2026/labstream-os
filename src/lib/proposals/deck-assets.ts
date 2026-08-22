// Assets del DECK de propuestas — CSS y motor CALCADOS de propuestas.labstreamsas.com/contenido/
// (mismas fuentes, paleta y engine.js). Generado; no editar a mano salvo los añadidos marcados.
// Se inyectan SOLO en las páginas del deck (portal /p/[token] y la vista previa) via <style> y
// <script> de página — nunca en el layout global — para no chocar con Tailwind del resto de la app.

export const DECK_FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Inter:wght@300;400;500;600&family=Poppins:wght@500;600;700&display=swap" rel="stylesheet">`;

export const DECK_CSS = `
/* ============ TOKENS ============ */
:root{
  --ink:#121110;
  --ink-2:#1D1B18;
  --ink-3:#262320;
  --circle-dark:#2E2A25;
  --cream:#F6F3EE;
  --light-tint:#EFEAE2;
  --gold:#F26A21;
  --gold-soft:#F7A366;
  --teal:#C8531B;
  --teal-soft:#F3DAC8;
  --t-on-dark:#F0ECE5;
  --t-on-dark-muted:#ABA298;
  --t-on-light:#1A1613;
  --t-on-light-muted:#6A625A;
  --maxw:1120px;
}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{
  font-family:'Inter',system-ui,sans-serif;
  background:var(--ink);
  color:var(--t-on-dark);
  -webkit-font-smoothing:antialiased;
  overflow-x:hidden;
}
h1,h2,h3,.serif{font-family:'Playfair Display',Georgia,serif;font-weight:600;letter-spacing:-.01em}
.kicker{font-size:.72rem;letter-spacing:.26em;text-transform:uppercase;font-weight:600;color:var(--gold)}
.wrap{max-width:var(--maxw);margin:0 auto;padding:0 clamp(22px,5vw,60px)}

/* ============ SCROLL / SECTIONS ============ */
main{scroll-snap-type:y proximity;}
section{
  min-height:100vh;
  scroll-snap-align:start;
  display:flex;flex-direction:column;justify-content:center;
  position:relative;padding:96px 0;overflow:hidden;
}
.sec-dark{background:var(--ink);color:var(--t-on-dark)}
.sec-light{background:var(--cream);color:var(--t-on-light)}
.sec-light .kicker{color:#B85A1E}

/* ============ VIDEO BG ============ */
.vidbg{position:absolute;inset:0;z-index:0;overflow:hidden}
.vidbg video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.scrim{position:absolute;inset:0;z-index:1}
.scrim-hero{background:radial-gradient(120% 90% at 50% 30%,rgba(18,17,16,.35),rgba(18,17,16,.86) 78%)}
.scrim-dark{background:linear-gradient(180deg,rgba(18,17,16,.58),rgba(18,17,16,.82))}
.vidbg + .scrim + .wrap,.wrap.z{position:relative;z-index:2}

/* ============ HERO ============ */
#hero{justify-content:flex-end;padding-bottom:12vh}
.hero-kick{margin-bottom:22px}
#hero h1{font-size:clamp(3.4rem,12vw,8.2rem);line-height:.94;font-weight:700}
#hero .lede{font-size:clamp(1.05rem,2.2vw,1.4rem);max-width:640px;margin-top:26px;color:var(--t-on-dark);font-weight:300;line-height:1.55}
.hero-meta{display:flex;flex-wrap:wrap;gap:14px 26px;margin-top:34px;font-size:.9rem;color:var(--t-on-dark-muted)}
.hero-meta b{color:var(--gold-soft);font-weight:600}
.hero-sub{display:block;font-size:clamp(1rem,3.4vw,1.7rem);font-family:'Playfair Display',serif;font-style:italic;color:var(--gold-soft);margin-top:6px;font-weight:400}

/* ============ TYPO BLOCKS ============ */
.sec-head{max-width:760px}
.sec-head h2{font-size:clamp(2.1rem,5.2vw,3.6rem);line-height:1.04;margin-top:16px}
.sec-head p.intro{font-size:clamp(1rem,1.6vw,1.16rem);margin-top:20px;line-height:1.6;color:inherit;opacity:.86;font-weight:300;max-width:640px}

/* ============ GRID / CARDS ============ */
.grid{display:grid;gap:20px;margin-top:44px}
.g2{grid-template-columns:repeat(2,1fr)}
.g3{grid-template-columns:repeat(3,1fr)}
.g4{grid-template-columns:repeat(4,1fr)}
.card{
  border-radius:18px;padding:26px 24px;
  transition:transform .4s cubic-bezier(.2,.7,.2,1),box-shadow .4s;
}
.sec-light .card{background:var(--light-tint)}
.sec-dark .card{background:var(--ink-2)}
.card:hover{transform:translateY(-6px)}
.sec-light .card:hover{box-shadow:0 22px 44px -22px rgba(30,20,14,.4)}
.sec-dark .card:hover{box-shadow:0 22px 44px -20px rgba(0,0,0,.6)}
.card .num{font-family:'Playfair Display',serif;font-size:1.5rem;color:var(--gold);font-weight:700}
.card h3{font-size:1.18rem;margin:14px 0 8px;font-family:'Playfair Display',serif}
.card p{font-size:.94rem;line-height:1.55;opacity:.82;font-weight:300}
.icon{width:46px;height:46px;border-radius:50%;display:grid;place-items:center;font-size:1.15rem;margin-bottom:16px}
.sec-light .icon{background:var(--teal-soft);color:#8A3B12}
.sec-dark .icon{background:var(--circle-dark);color:var(--gold-soft)}

/* ============ CLIENT LOGOS ============ */
.logos{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-top:44px}
.logo-cell{
  aspect-ratio:16/7;border-radius:14px;display:grid;place-items:center;
  border:1px dashed rgba(170,162,152,.35);
  font-family:'Poppins',sans-serif;font-weight:600;letter-spacing:.02em;
  color:var(--t-on-dark-muted);font-size:.98rem;text-align:center;
  transition:.35s;background:rgba(255,255,255,.015)
}
.logo-cell:hover{border-color:var(--gold);color:var(--gold-soft)}
.logo-cell small{display:block;font-family:'Inter';font-weight:400;font-size:.62rem;letter-spacing:.18em;opacity:.5;margin-top:4px;text-transform:uppercase}
.editnote{margin-top:22px;font-size:.78rem;letter-spacing:.04em;color:var(--t-on-dark-muted);opacity:.7}

/* ============ LIST / CHECK ============ */
.checks{margin-top:40px;display:grid;grid-template-columns:1fr 1fr;gap:16px 40px}
.check{display:flex;gap:14px;align-items:flex-start;font-size:1.02rem;line-height:1.45;padding:6px 0}
.check .mk{flex:0 0 auto;width:26px;height:26px;border-radius:50%;background:var(--teal);color:#fff;display:grid;place-items:center;font-size:.8rem;margin-top:2px}
.check b{font-weight:600}
.check span small{display:block;font-weight:300;opacity:.7;font-size:.86rem;margin-top:3px}

/* ============ TIMELINE ============ */
.tl{margin-top:40px;display:grid;gap:0}
.tl-row{display:grid;grid-template-columns:120px 1fr;gap:26px;padding:18px 0;border-top:1px solid rgba(120,112,104,.22)}
.tl-row:last-child{border-bottom:1px solid rgba(120,112,104,.22)}
.tl-time{font-family:'Playfair Display',serif;font-size:1.25rem;color:var(--gold);font-weight:700}
.tl-time small{display:block;font-family:'Inter';font-size:.68rem;letter-spacing:.14em;text-transform:uppercase;opacity:.6;color:inherit;font-weight:400;margin-top:2px}
.tl-body b{font-weight:600;font-size:1.05rem}
.tl-body p{opacity:.8;font-weight:300;font-size:.95rem;margin-top:4px;line-height:1.5}

/* ============ STATS ============ */
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:44px}
.stat{text-align:center;padding:22px 10px;border-radius:16px;background:rgba(242,106,33,.08)}
.stat .big{font-family:'Playfair Display',serif;font-size:clamp(2.4rem,6vw,3.6rem);font-weight:700;color:var(--gold);line-height:1}
.stat .lab{font-size:.82rem;letter-spacing:.06em;margin-top:8px;opacity:.8;text-transform:uppercase}

/* ============ PRICING ============ */
.price-wrap{margin-top:40px}
.price-row{display:grid;grid-template-columns:1fr auto;gap:20px;align-items:baseline;padding:16px 0;border-top:1px solid rgba(120,112,104,.22)}
.price-row .desc b{font-weight:600;font-size:1.04rem}
.price-row .desc p{opacity:.72;font-weight:300;font-size:.86rem;margin-top:3px;line-height:1.4;max-width:520px}
.price-row .amt{font-family:'Playfair Display',serif;font-weight:700;font-size:1.2rem;white-space:nowrap}
.price-total{display:grid;grid-template-columns:1fr auto;gap:20px;align-items:baseline;margin-top:14px;padding:22px 24px;border-radius:16px;background:var(--ink-2);color:var(--t-on-dark)}
.price-total .amt{font-family:'Playfair Display',serif;font-weight:700;font-size:clamp(1.6rem,4vw,2.2rem);color:var(--gold-soft)}
.price-total .l{font-size:.8rem;letter-spacing:.16em;text-transform:uppercase;color:var(--t-on-dark-muted)}
.addons{margin-top:26px;display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.addon{background:var(--light-tint);border-radius:14px;padding:18px}
.addon b{font-weight:600;font-size:.98rem;display:block}
.addon p{opacity:.72;font-size:.82rem;margin:4px 0 8px;font-weight:300}
.addon .a{font-family:'Playfair Display',serif;font-weight:700;color:#B85A1E}
.finenote{margin-top:24px;font-size:.8rem;opacity:.7;line-height:1.6}

/* ============ CIERRE ============ */
#cierre{align-items:center;text-align:center}
#cierre h2{font-size:clamp(2.6rem,7vw,5rem);line-height:1.02}
#cierre .lede{max-width:560px;margin:24px auto 0;font-weight:300;font-size:1.1rem;opacity:.9}
.contact{margin-top:40px;display:flex;flex-wrap:wrap;gap:14px;justify-content:center}
.pill{border:1px solid rgba(247,163,102,.4);color:var(--gold-soft);padding:12px 22px;border-radius:40px;font-size:.92rem;text-decoration:none;transition:.3s;letter-spacing:.02em}
.pill:hover{background:var(--gold);color:var(--ink);border-color:var(--gold)}
.pill.solid{background:var(--gold);color:var(--ink);border-color:var(--gold);font-weight:600}
.signoff{margin-top:56px;font-family:'Poppins',sans-serif;font-weight:700;font-size:1.5rem;letter-spacing:-.02em;color:var(--cream)}
.signoff .dot{color:var(--gold)}

/* ============ HEADER ============ */
#topbar{position:fixed;top:0;left:0;right:0;z-index:40;display:flex;align-items:center;justify-content:space-between;
  padding:20px clamp(22px,5vw,44px);transition:color .5s,background .5s;pointer-events:none}
#topbar .brand{font-family:'Poppins',sans-serif;font-weight:700;font-size:1.28rem;letter-spacing:-.02em;pointer-events:auto}
#topbar .brand .dot{color:var(--gold)}
#topbar .tag{font-size:.7rem;letter-spacing:.2em;text-transform:uppercase;opacity:.7;pointer-events:auto}
body.t-light #topbar{color:var(--t-on-light)}
body:not(.t-light) #topbar{color:var(--cream)}
#progress{position:fixed;top:0;left:0;height:3px;background:linear-gradient(90deg,var(--teal),var(--gold));z-index:50;width:0;transition:width .1s linear}

/* ============ DOT NAV ============ */
#dots{position:fixed;right:22px;top:50%;transform:translateY(-50%);z-index:40;display:flex;flex-direction:column;gap:14px}
#dots a{width:11px;height:11px;border-radius:50%;background:rgba(170,162,152,.4);position:relative;transition:.3s;cursor:pointer}
#dots a.active{background:var(--gold);transform:scale(1.25)}
#dots a .lb{position:absolute;right:22px;top:50%;transform:translateY(-50%);white-space:nowrap;font-size:.7rem;letter-spacing:.08em;
  text-transform:uppercase;opacity:0;pointer-events:none;transition:.3s;padding:4px 10px;border-radius:20px;background:rgba(18,17,16,.82);color:var(--cream)}
#dots a:hover .lb{opacity:1}
body.t-light #dots a:not(.active){background:rgba(26,22,19,.28)}

/* ============ SLIDE NAV ARROWS ============ */
#navarrows{position:fixed;right:24px;bottom:24px;z-index:46;display:flex;flex-direction:column;gap:10px}
#navarrows button{width:50px;height:50px;border-radius:50%;border:1px solid rgba(247,163,102,.5);background:rgba(18,17,16,.55);color:var(--gold-soft);font-size:1.35rem;line-height:1;cursor:pointer;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);transition:.3s;display:grid;place-items:center}
#navarrows button:hover{background:var(--gold);color:var(--ink);border-color:var(--gold);transform:scale(1.06)}
#navarrows button:active{transform:scale(.96)}
body.t-light #navarrows button{background:rgba(255,255,255,.7);color:#B85A1E;border-color:rgba(154,122,52,.4)}

/* ============ REVEAL ============ */
.r{opacity:0;transform:translateY(28px);transition:opacity .9s cubic-bezier(.2,.7,.2,1),transform .9s cubic-bezier(.2,.7,.2,1)}
.in .r{opacity:1;transform:none}
.in .r:nth-child(2){transition-delay:.08s}
.in .r:nth-child(3){transition-delay:.16s}
.in .r:nth-child(4){transition-delay:.24s}
.in .r-d1{transition-delay:.1s}.in .r-d2{transition-delay:.2s}.in .r-d3{transition-delay:.3s}.in .r-d4{transition-delay:.4s}

/* ============ SCROLL HINT ============ */
.scrollhint{position:absolute;bottom:26px;left:50%;transform:translateX(-50%);z-index:3;font-size:.7rem;letter-spacing:.2em;text-transform:uppercase;color:var(--t-on-dark-muted);display:flex;flex-direction:column;align-items:center;gap:8px}
.scrollhint .line{width:1px;height:34px;background:linear-gradient(var(--gold),transparent);animation:drop 1.8s infinite}
@keyframes drop{0%{transform:scaleY(0);transform-origin:top}50%{transform:scaleY(1);transform-origin:top}51%{transform-origin:bottom}100%{transform:scaleY(0);transform-origin:bottom}}

/* ============ GATE ============ */
#gate{position:fixed;inset:0;z-index:100;background:var(--ink);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:30px;transition:opacity .7s,visibility .7s}
#gate.hide{opacity:0;visibility:hidden}
#gate .gvid{position:absolute;inset:0;z-index:0;overflow:hidden}
#gate .gvid video{width:100%;height:100%;object-fit:cover;opacity:.34}
#gate .gscrim{position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 40%,rgba(18,17,16,.5),rgba(18,17,16,.92));z-index:1}
#gate .gc{position:relative;z-index:2;max-width:420px}
#gate .brand{font-family:'Poppins',sans-serif;font-weight:700;font-size:2rem;letter-spacing:-.02em;color:var(--cream)}
#gate .brand .dot{color:var(--gold)}
#gate .gk{margin-top:26px;font-size:.72rem;letter-spacing:.24em;text-transform:uppercase;color:var(--gold)}
#gate h2{font-family:'Playfair Display',serif;font-size:1.9rem;margin-top:12px;color:var(--cream);font-weight:600}
#gate p{margin-top:12px;color:var(--t-on-dark-muted);font-size:.95rem;font-weight:300;line-height:1.5}
.gform{margin-top:26px;display:flex;gap:10px;justify-content:center}
.gform input{background:rgba(255,255,255,.06);border:1px solid rgba(170,162,152,.3);color:var(--cream);padding:14px 18px;border-radius:40px;font-size:1rem;width:220px;outline:none;text-align:center;letter-spacing:.05em;transition:.3s}
.gform input:focus{border-color:var(--gold)}
.gform button{background:var(--gold);color:var(--ink);border:none;padding:14px 26px;border-radius:40px;font-weight:600;font-size:1rem;cursor:pointer;transition:.3s;font-family:'Inter'}
.gform button:hover{filter:brightness(1.08)}
#gerr{margin-top:14px;color:#D98C7A;font-size:.85rem;height:18px;opacity:0;transition:.3s}
#gerr.show{opacity:1}

/* ============ PRICING PHASES ============ */
.pphase{padding:20px 0;border-top:1px solid rgba(120,112,104,.22)}
.pphead{display:flex;justify-content:space-between;align-items:baseline;gap:20px}
.pname{font-family:'Playfair Display',serif;font-weight:600;font-size:1.22rem}
.pamt{font-family:'Playfair Display',serif;font-weight:700;font-size:1.22rem;color:#B85A1E;white-space:nowrap}
.pitems{list-style:none;margin:12px 0 0;display:grid;grid-template-columns:1fr 1fr;gap:6px 28px}
.pitems li{position:relative;padding-left:18px;font-size:.92rem;opacity:.82;font-weight:300;line-height:1.4}
.pitems li::before{content:"";position:absolute;left:0;top:.55em;width:6px;height:6px;border-radius:50%;background:var(--teal)}
.psummary{margin-top:24px;background:var(--ink-2);color:var(--t-on-dark);border-radius:16px;padding:20px 26px}
.psr{display:flex;justify-content:space-between;align-items:baseline;padding:8px 0;font-size:1rem}
.psr .l{color:var(--t-on-dark-muted);letter-spacing:.02em}
.psr .v{font-family:'Playfair Display',serif;font-weight:600}
.psr.grand{border-top:1px solid rgba(170,162,152,.25);margin-top:6px;padding-top:16px}
.psr.grand .l{color:var(--cream);font-size:1.02rem;letter-spacing:.1em;text-transform:uppercase}
.psr.grand .v{font-size:clamp(1.6rem,4vw,2.1rem);color:var(--gold-soft);font-weight:700}

/* ============ VIDEO GALLERY ============ */
.vgrid{display:grid;grid-template-columns:repeat(2,1fr);gap:18px;margin-top:44px}
.vcard{position:relative;border-radius:16px;overflow:hidden;aspect-ratio:16/9;background:var(--ink-2)}
.vcard video{width:100%;height:100%;object-fit:cover;display:block}
.vcard .vcap{position:absolute;left:0;right:0;bottom:0;padding:30px 18px 14px;font-size:.92rem;font-weight:500;letter-spacing:.02em;color:var(--cream);background:linear-gradient(transparent,rgba(18,17,16,.85))}

/* ============ HEADER LOGO ============ */
#topbar .brand{display:flex;align-items:center}
.blogo{height:26px;width:auto;display:block}
.blogo-dark{display:none}
body.t-light .blogo-light{display:none}
body.t-light .blogo-dark{display:block}

/* ============ LOGO WALL ============ */
.logowall{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-top:44px}
.lw{background:#fff;border-radius:14px;aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;padding:20px;transition:.35s;box-shadow:0 10px 34px -20px rgba(0,0,0,.55)}
.lw:hover{transform:translateY(-4px);box-shadow:0 18px 40px -20px rgba(0,0,0,.6)}
.lw img{max-width:100%;max-height:100%;object-fit:contain;opacity:.94;transition:.35s}
.lw:hover img{opacity:1}
.lw.itau{background:#F36A21}
.lw.itau img{opacity:1;mix-blend-mode:normal}
.lwtxt{display:none;align-items:center;justify-content:center;font-family:'Poppins',sans-serif;font-weight:600;color:#3a3632;font-size:1rem;text-align:center;line-height:1.2}

/* ============ REEL VERTICAL ============ */
.reel-wrap{display:grid;grid-template-columns:1fr auto;gap:52px;align-items:center}
.reel-copy{max-width:520px}
.reel-phone{width:268px;aspect-ratio:9/16;border-radius:32px;overflow:hidden;border:8px solid #0c0b0a;box-shadow:0 34px 74px -28px rgba(0,0,0,.85);background:#000;flex:0 0 auto}
.reel-phone video{width:100%;height:100%;object-fit:cover;display:block}

/* ============ PDF BUTTON ============ */
#pdfbtn{position:fixed;left:24px;bottom:24px;z-index:47;display:inline-flex;align-items:center;gap:9px;background:var(--gold);color:var(--ink);padding:13px 20px;border-radius:40px;font-size:.85rem;font-weight:600;text-decoration:none;box-shadow:0 12px 32px -12px rgba(0,0,0,.55);transition:.3s;font-family:'Inter'}
#pdfbtn:hover{filter:brightness(1.07);transform:translateY(-2px)}
#pdfbtn .pi{font-size:1rem}
.pdf-inline{display:inline-flex;align-items:center;gap:9px;background:var(--ink);color:var(--gold-soft);padding:14px 24px;border-radius:40px;font-size:.9rem;font-weight:600;text-decoration:none;margin-top:24px;transition:.3s}
.pdf-inline:hover{background:#0a120e;transform:translateY(-2px)}

/* ============ HERO · PARA LA DOCTORA ============ */
.hero-for{display:inline-flex;flex-wrap:wrap;align-items:baseline;gap:9px;margin:6px 0 4px;padding:11px 20px;border:1px solid rgba(242,106,33,.55);border-radius:44px;background:rgba(242,106,33,.14);backdrop-filter:blur(5px);font-family:'Poppins',sans-serif}
.hero-for{font-size:.82rem;letter-spacing:.06em;text-transform:uppercase;color:var(--gold-soft);font-weight:500}
.hero-for b{font-family:'Playfair Display',serif;font-size:1.5rem;font-weight:700;letter-spacing:.01em;text-transform:none;color:#fff}
.hero-for i{font-style:normal;font-size:.9rem;text-transform:none;letter-spacing:.02em;color:var(--gold-soft);opacity:.92}
@media(max-width:560px){.hero-for b{font-size:1.25rem}}

/* ============ REEL / PERFIL CARDS ============ */
.reelcard{background:#fff;border-radius:16px;overflow:hidden;text-decoration:none;color:var(--t-on-light);display:flex;flex-direction:column;transition:.35s;box-shadow:0 10px 30px -18px rgba(0,0,0,.4)}
.reelcard:hover{transform:translateY(-6px);box-shadow:0 20px 44px -20px rgba(0,0,0,.5)}
.reelthumb{aspect-ratio:16/10;background:linear-gradient(135deg,#F58529,#DD2A7B,#8134AF);display:grid;place-items:center;position:relative}
.reelthumb .rplay{width:56px;height:56px;border-radius:50%;background:rgba(255,255,255,.92);color:#DD2A7B;display:grid;place-items:center;font-size:1.15rem;padding-left:4px}
.reelthumb .rig{position:absolute;top:12px;right:14px;color:#fff;font-size:.66rem;letter-spacing:.14em;text-transform:uppercase;font-weight:600;opacity:.9}
.reelinfo{padding:20px 22px;display:flex;flex-direction:column;gap:3px}
.reelinfo h3{font-family:'Playfair Display',serif;font-size:1.2rem}
.rspec{font-size:.82rem;color:var(--t-on-light-muted)}
.rhandle{font-size:.86rem;color:#C13584;font-weight:600;margin-top:4px}
.rcta{margin-top:12px;font-size:.82rem;font-weight:600;color:var(--gold)}

/* ============ INSTAGRAM EMBEDS ============ */
.reelgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;margin-top:44px;align-items:start}
.igcard{background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 16px 42px -22px rgba(0,0,0,.5);display:flex;flex-direction:column;border:1px solid rgba(120,112,104,.14)}
.ightop{padding:17px 20px 13px}
.ightop h3{font-family:'Playfair Display',serif;font-size:1.16rem;color:var(--t-on-light)}
.igspec{font-size:.82rem;color:var(--t-on-light-muted)}
.igframe{width:100%;height:600px;border:0;display:block;background:#fafafa}
.igfoot{display:block;padding:14px 20px;text-decoration:none;font-size:.85rem;font-weight:600;color:#C13584;border-top:1px solid #f0eae4;transition:.25s}
.igfoot:hover{color:var(--gold)}
@media(max-width:980px){.igframe{height:540px}}
@media(max-width:860px){.reelgrid{grid-template-columns:1fr;max-width:420px;margin:44px auto 0}.igframe{height:640px}}

/* ============ PRICING TIERS ============ */
.tiers{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:44px;align-items:stretch}
.tier{position:relative;background:#fff;border:1px solid rgba(120,112,104,.18);border-radius:18px;padding:30px 24px;display:flex;flex-direction:column;transition:.35s}
.tier:hover{transform:translateY(-6px);box-shadow:0 22px 44px -22px rgba(0,0,0,.35)}
.tier.feat{background:var(--ink);color:var(--t-on-dark);border-color:var(--gold)}
.tier .tbadge{position:absolute;top:-11px;left:24px;background:var(--gold);color:var(--ink);font-size:.64rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;padding:5px 12px;border-radius:20px}
.tname{font-family:'Playfair Display',serif;font-size:1.4rem;font-weight:600}
.tprice{font-family:'Playfair Display',serif;font-size:2rem;font-weight:700;color:var(--gold);margin-top:6px;line-height:1}
.tier.feat .tprice{color:var(--gold-soft)}
.tprice span{font-family:'Inter';font-size:.85rem;font-weight:400;color:var(--t-on-light-muted)}
.tier.feat .tprice span{color:var(--t-on-dark-muted)}
.tsub{font-size:.85rem;opacity:.72;margin:4px 0 18px}
.tier ul{list-style:none;display:flex;flex-direction:column;gap:9px}
.tier li{position:relative;padding-left:22px;font-size:.9rem;line-height:1.4;opacity:.92}
.tier li::before{content:"\\2713";position:absolute;left:0;color:var(--gold);font-weight:700}
.tier.feat li::before{color:var(--gold-soft)}
.tier li.hi{font-weight:600;opacity:1}
.tier-terms{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:24px}
.tt-card{background:var(--light-tint);border-radius:14px;padding:20px 22px}
.tt-card b{font-weight:600;display:block;margin-bottom:6px;color:var(--t-on-light)}
.tt-card p{font-size:.88rem;opacity:.8;line-height:1.5;font-weight:300}

/* ============ RESPONSIVE ============ */
@media(max-width:860px){
  .g3,.g4,.logos,.stats,.addons,.logowall{grid-template-columns:repeat(2,1fr)}
  .tiers,.tier-terms{grid-template-columns:1fr}
  .checks,.pitems{grid-template-columns:1fr}
  .reel-wrap{grid-template-columns:1fr;justify-items:center;text-align:center}
  .reel-copy{text-align:center;margin-bottom:8px}
  #pdfbtn{font-size:.76rem;padding:11px 15px;left:16px;bottom:16px}
  .g2{grid-template-columns:1fr}
  #dots{display:none}
  .tl-row{grid-template-columns:92px 1fr;gap:16px}
  #topbar .tag{display:none}
}
@media(max-width:520px){
  .g3,.g4,.logos,.stats,.addons,.vgrid{grid-template-columns:1fr}
  #hero h1{font-size:clamp(3rem,17vw,5rem)}
  .price-row{grid-template-columns:1fr}
  .price-row .amt{justify-self:start}
}
@media(prefers-reduced-motion:reduce){*{animation:none!important}.r{transition:none;opacity:1;transform:none}}

/* Flechas de navegación en pantalla (además de rueda y teclado) */
#navprev,#navnext{position:fixed;right:22px;z-index:60;width:46px;height:46px;border-radius:999px;border:1px solid rgba(255,255,255,.28);background:rgba(0,0,0,.34);color:#fff;display:grid;place-items:center;cursor:pointer;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);transition:background .2s,opacity .25s,transform .15s;font-size:20px;line-height:1}
#navprev:hover,#navnext:hover{background:var(--gold);border-color:var(--gold);transform:scale(1.06)}
#navprev{bottom:82px}#navnext{bottom:26px}
body.t-light #navprev,body.t-light #navnext{border-color:rgba(0,0,0,.16);background:rgba(255,255,255,.6);color:var(--t-on-light)}
@media(max-width:560px){#navprev,#navnext{right:12px;width:42px;height:42px}#navprev{bottom:74px}#navnext{bottom:20px}}
@media(prefers-reduced-motion:reduce){#navprev,#navnext{transition:none}}

/* ── Contenedor de scroll ── La app (root layout) hace de <body> el scroller y fija <html> a la
   altura del viewport, lo que congela el scroll PROGRAMÁTICO (scrollIntoView/scrollTo) del deck.
   Solución autocontenida: #main ES el scroller (100dvh + overflow), así scrollIntoView (flechas,
   rueda, puntos) y el enganche de diapositivas funcionan sin pelear con html/body. La cromática
   fija (#progress/#topbar/#dots/flechas) queda respecto al viewport, que #main llena. Va al final
   para ganar la cascada; solo afecta a las páginas del deck (el <style> es de página). */
html,body{margin:0!important}
main#main{height:100vh;height:100dvh;overflow-y:auto;overflow-x:hidden;scroll-snap-type:y proximity;-webkit-overflow-scrolling:touch;scroll-behavior:smooth}
`;

export const DECK_ENGINE = `
(function(){
  "use strict";
  /* ---------- DOT NAV BUILD ---------- */
  var sections = Array.prototype.slice.call(document.querySelectorAll('main > section'));
  var dots = document.getElementById('dots');
  sections.forEach(function(s, i){
    var a = document.createElement('a');
    a.setAttribute('data-i', i);
    var lb = document.createElement('span');
    lb.className='lb'; lb.textContent = s.getAttribute('data-label') || ('0'+(i+1));
    a.appendChild(lb);
    a.addEventListener('click', function(){ s.scrollIntoView({behavior:'smooth'}); });
    dots.appendChild(a);
  });
  var dotEls = Array.prototype.slice.call(dots.children);

  /* ---------- OBSERVER: reveal + theme + active ---------- */
  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(en){
      if(en.isIntersecting){
        en.target.classList.add('in');
        if(en.intersectionRatio > 0.5){
          var theme = en.target.getAttribute('data-theme');
          document.body.classList.toggle('t-light', theme === 'light');
          var idx = sections.indexOf(en.target);
          dotEls.forEach(function(d,i){ d.classList.toggle('active', i===idx); });
        }
      }
    });
  }, {root: document.getElementById('main'), threshold:[0.15,0.5,0.75]});
  sections.forEach(function(s){ io.observe(s); });

  /* ---------- PROGRESS BAR ---------- */
  var prog = document.getElementById('progress');
  var _scroller = document.getElementById('main');
  function onScroll(){
    var max = _scroller.scrollHeight - _scroller.clientHeight;
    var p = max>0 ? _scroller.scrollTop/max : 0;
    prog.style.width = (p*100).toFixed(2)+'%';
  }
  _scroller.addEventListener('scroll', onScroll, {passive:true});
  onScroll();

  /* ---------- COUNTERS ---------- */
  var counted = false;
  var cio = new IntersectionObserver(function(entries){
    entries.forEach(function(en){
      if(en.isIntersecting && !en.target._done){
        en.target._done = true;
        var target = parseFloat(en.target.getAttribute('data-target'));
        var t0 = null, dur = 1100;
        function step(ts){
          if(!t0) t0 = ts;
          var k = Math.min((ts-t0)/dur, 1);
          var val = Math.round(k*target);
          en.target.textContent = val;
          if(k<1) requestAnimationFrame(step);
          else en.target.textContent = target;
        }
        requestAnimationFrame(step);
      }
    });
  }, {threshold:0.8});
  document.querySelectorAll('.count').forEach(function(c){ cio.observe(c); });

  /* ---------- KEYBOARD NAV ---------- */
  function current(){
    var mid = window.innerHeight/2, best=0, bd=Infinity;
    sections.forEach(function(s,i){
      var r = s.getBoundingClientRect();
      var d = Math.abs(r.top + r.height/2 - mid);
      if(d<bd){bd=d;best=i;}
    });
    return best;
  }
  function goTo(i){ i = Math.max(0, Math.min(i, sections.length-1)); sections[i].scrollIntoView({behavior:'smooth'}); }
  var NEXT_KEYS = ['ArrowDown','PageDown','ArrowRight',' ','Spacebar'];
  var PREV_KEYS = ['ArrowUp','PageUp','ArrowLeft'];
  window.addEventListener('keydown', function(e){
    var isNext = NEXT_KEYS.indexOf(e.key) !== -1, isPrev = PREV_KEYS.indexOf(e.key) !== -1;
    if(!isNext && !isPrev) return;
    e.preventDefault();
    goTo(current() + (isNext ? 1 : -1));
  });
  var _bp = document.getElementById('navprev'), _bn = document.getElementById('navnext');
  if(_bp) _bp.addEventListener('click', function(){ goTo(current()-1); });
  if(_bn) _bn.addEventListener('click', function(){ goTo(current()+1); });

  /* ---------- WHEEL NAV (una rueda del mouse = una diapositiva) ---------- */
  var wheelLock=false;
  window.addEventListener('wheel', function(e){
    if(wheelLock){ e.preventDefault(); return; }
    var i=current(), sec=sections[i], r=sec.getBoundingClientRect(), dir=e.deltaY>0?1:-1;
    if(Math.abs(e.deltaY)<4) return;
    if(dir>0 && r.bottom > window.innerHeight+2) return;   // aún hay contenido abajo en esta sección
    if(dir<0 && r.top < -2) return;                        // aún hay contenido arriba
    if((dir>0 && i>=sections.length-1) || (dir<0 && i<=0)) return;
    e.preventDefault();
    wheelLock=true;
    goTo(i+dir);
    setTimeout(function(){ wheelLock=false; }, 780);
  }, {passive:false});

  /* ---------- FORCE VIDEO AUTOPLAY (robusto para todos los navegadores) ---------- */
  function playAllVideos(){
    document.querySelectorAll('video').forEach(function(v){
      v.muted = true; v.setAttribute('muted','');
      v.playsInline = true;
      var p = v.play();
      if(p && p.catch){ p.catch(function(){}); }
    });
  }
  playAllVideos();
  window.addEventListener('load', playAllVideos);
  document.addEventListener('visibilitychange', function(){ if(!document.hidden){ playAllVideos(); } });
  ['click','touchstart','pointerdown','keydown','scroll'].forEach(function(evt){
    window.addEventListener(evt, playAllVideos, {once:true, passive:true});
  });
})();
`;
