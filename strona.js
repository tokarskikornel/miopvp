// Strona MIO PVP: czyta dane.json (eksport z serwera co 5 min) i rysuje Ranking, Mecze i Profil.
// Adresy: #ranking/<kit|ogolny>, #mecze, #gracz/<nick>. Teksty z danych zawsze przez textContent.
'use strict';

const tresc = document.getElementById('tresc');
let dane = null;
const sortowanie = { kol: 'elo', malejaco: true };

// ---------- male pomocniki ----------

/** el('div', {class: 'x'}, 'tekst', innyElement) - tworzy element; stringi wstawiane jako tekst. */
function el(tag, atrybuty, ...dzieci) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(atrybuty || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const d of dzieci.flat()) {
    if (d === null || d === undefined || d === false) continue;
    e.append(d instanceof Node ? d : document.createTextNode(String(d)));
  }
  return e;
}

const glowa = (nick, px) => el('img', { src: `https://mc-heads.net/avatar/${encodeURIComponent(nick)}/${px}`, alt: '', loading: 'lazy' });
const linkGracza = (nick, px = 56) => el('a', { class: 'gracz', href: '#gracz/' + encodeURIComponent(nick) }, glowa(nick, px), nick);
const tierKlasa = tier => 't' + tier.charAt(2);
const plakietkaTieru = tier => el('span', { class: 'tier ' + tierKlasa(tier) }, tier);
const kitPoKluczu = klucz => dane.kity.find(k => k.klucz === klucz)
  || { klucz, nazwa: klucz.charAt(0).toUpperCase() + klucz.slice(1), ikona: 'PAPER' }; // kit spoza rankingu, np. lifesteal
const ikonaKitu = klucz => el('img', { src: `ikony/${kitPoKluczu(klucz).ikona}.png`, alt: '', onerror: e => e.target.remove() });
const nazwaKitu = klucz => kitPoKluczu(klucz).nazwa;
const ZNAK = n => (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n);
const ruch = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Dzieci pojawiaja sie jedno po drugim (CSS .kaskada + zmienna --i), gdy wjada w ekran. */
function kaskada(kontener) {
  kontener.classList.add('kaskada');
  [...kontener.children].forEach((d, i) => d.style.setProperty('--i', Math.min(i, 12)));
  return kontener;
}

// Obserwator: element dostaje .widac przy wejsciu w ekran; opoznienie liczone w paczce, ktora weszla razem.
const obserwator = 'IntersectionObserver' in window ? new IntersectionObserver(wpisy => {
  wpisy.filter(w => w.isIntersecting).forEach((w, i) => {
    w.target.style.setProperty('--i', i);
    w.target.classList.add('widac');
    obserwator.unobserve(w.target);
  });
}, { rootMargin: '0px 0px -8% 0px' }) : null;

function obserwuj() {
  document.querySelectorAll('.kaskada > *:not(.widac), .wjazd:not(.widac)').forEach(e => {
    if (obserwator) obserwator.observe(e); else e.classList.add('widac');
  });
}

/** Napis "miopvp.com" w stopce: kazda litera osobno (fala przy wejsciu i przy najechaniu). */
function litery(e) {
  const tekst = e.textContent;
  e.replaceChildren(...[...tekst].map((z, i) => el('span', { class: 'litera', style: '--l:' + i, 'aria-hidden': 'true' }, z)));
}

/** Pole z naglowkiem: tytul przesuwa sie wolniej niz strona (tylko translate). */
function paralaksa() {
  if (!ruch()) return;
  let czeka = false;
  addEventListener('scroll', () => {
    if (czeka) return;
    czeka = true;
    requestAnimationFrame(() => {
      const y = Math.min(scrollY, 600);
      document.querySelectorAll('.baner h1, .profil-top h1').forEach(h => h.style.setProperty('--paralaksa', (y * 0.18).toFixed(1) + 'px'));
      czeka = false;
    });
  }, { passive: true });
}

/** Liczby odliczaja sie od zera: podium (po wjezdzie karty), baner i statystyki profilu. */
function odliczanie() {
  if (!ruch()) return;
  const podium = [...document.querySelectorAll('.podium-liczba')];
  document.querySelectorAll('.podium-liczba, .baner-liczba b, .staty b').forEach(e => {
    const tekst = e.textContent;
    const cel = Number(tekst);
    if (tekst === '' || Number.isNaN(cel)) return; // tier (np. "HT3") nie jest liczba - zostaje bez odliczania
    const miejsca = (tekst.split('.')[1] || '').length;
    const i = podium.indexOf(e);
    const opoznienie = i < 0 ? 300 : [500, 400, 600][i] ?? 400; // kolejnosc w HTML: 2., 1., 3. miejsce
    e.textContent = (0).toFixed(miejsca);
    const start = performance.now() + opoznienie;
    const krok = t => {
      const p = Math.min(1, Math.max(0, (t - start) / 900));
      const v = cel * (1 - Math.pow(1 - p, 3));
      e.textContent = miejsca ? v.toFixed(miejsca) : String(Math.round(v));
      if (p < 1) requestAnimationFrame(krok);
    };
    requestAnimationFrame(krok);
  });
}

function czasTemu(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const dni = Math.floor(s / 86400);
  return dni === 1 ? 'yesterday' : `${dni} days ago`;
}

// Drabinka tierow i punkty - tak samo jak miopvp-eksport/eksport.py (NAZWY_TIEROW, PUNKTY).
const TIERY = ['LT5', 'MT5', 'HT5', 'LT4', 'MT4', 'HT4', 'LT3', 'MT3', 'HT3', 'LT2', 'MT2', 'HT2', 'LT1', 'MT1', 'HT1'];
const PUNKTY = { LT5: 1, MT5: 2, HT5: 3, LT4: 4, MT4: 5, HT4: 6, LT3: 7, MT3: 8, HT3: 10,
  LT2: 20, MT2: 25, HT2: 30, LT1: 45, MT1: 52, HT1: 60 };

// Tytuly za punkty - tylko na stronie (jak "titles" na stronach z tierami), od najwyzszego.
const TYTULY = [[200, 'Grandmaster'], [100, 'Master'], [50, 'Elite'], [25, 'Veteran'], [10, 'Fighter'], [1, 'Rookie'], [0, 'Newcomer']];
const tytul = punkty => TYTULY.find(([od]) => punkty >= od)[1];

/** Miejsce gracza w rankingu ogolnym (1, 2, ...) albo null. */
const miejsceOgolne = nick => { const i = dane.ogolny.findIndex(g => g.nick === nick); return i < 0 ? null : i + 1; };
const miejsceWKicie = (nick, kit) => { const i = (dane.rankingi[kit]?.gracze || []).findIndex(g => g.nick === nick); return i < 0 ? null : i + 1; };

/** Najlepszy tier gracza (z kitu o najwyzszym ELO). */
function najlepszyTier(gracz) {
  let naj = null;
  for (const [klucz, k] of Object.entries(gracz.kity)) {
    if (k.tier && (!naj || k.elo > naj.elo)) naj = { ...k, klucz };
  }
  return naj;
}

// ---------- RANKING ----------

function pigulki(aktywny) {
  const p = el('nav', { class: 'pigulki', 'aria-label': 'Kits' },
    el('a', { class: 'pig' + (aktywny === 'ogolny' ? ' akt' : ''), href: '#ranking/ogolny' }, 'Overall'));
  for (const k of dane.kity) {
    p.append(el('a', { class: 'pig' + (aktywny === k.klucz ? ' akt' : ''), href: '#ranking/' + k.klucz }, ikonaKitu(k.klucz), k.nazwa));
  }
  return kaskada(p);
}

/**
 * Ranking jak "Overall Ladder" z PvPHQ, w kolorach MIO PVP: baner, pigulki, podium TOP 3
 * (1 zloto, 2 srebro, 3 braz - te same kolory co tiery 1-3), dalej karty w dwoch kolumnach.
 */
function pokazRanking(kit) {
  if (kit !== 'ogolny' && !dane.rankingi[kit]) kit = 'ogolny';
  const ogolny = kit === 'ogolny';
  // Jeden format dla obu widokow: liczba = punkty (Ogolny) albo tier (kit).
  // Kolejnosc rankingu (podium i numery miejsc) zawsze wg tieru/ELO; sortowanie zmienia tylko kolejnosc kart 4+.
  const wgRankingu = ogolny
    ? dane.ogolny.map((g, i) => ({ nick: g.nick, liczba: g.punkty, jednostka: 'pkt', tiery: g.tiery, miejsce: i + 1 }))
    : dane.rankingi[kit].gracze.map((g, i) => ({ nick: g.nick, liczba: g.tier, jednostka: 'tier', tier: g.tier, gr: g, miejsce: i + 1 }));
  const reszta = ogolny ? wgRankingu.slice(3)
    : posortowane(wgRankingu.slice(3).map(g => ({ ...g.gr, _g: g }))).map(x => x._g);
  const gracze = wgRankingu.slice(0, 3).concat(reszta);
  const wszystkich = Object.keys(dane.gracze).length;

  // replaceChildren zamienia null na tekst "null" - puste czesci (np. brak listy przy <= 3 graczach) wyrzucamy.
  tresc.replaceChildren(...[
    pigulki(kit),
    baner(ogolny ? 'Overall ranking' : nazwaKitu(kit), gracze.length, wszystkich),
    gracze.length ? podium(gracze.slice(0, 3)) : el('div', { class: 'karta pusto' },
      ogolny ? 'Nobody has finished placements yet.' : 'Nobody has a tier in ' + nazwaKitu(kit) + ' yet.'),
    gracze.length > 3 ? el('div', { class: 'lista-pasek' },
      el('span', {}, 'Showing ', el('b', { class: 'wart' }, gracze.length), ' players'),
      ogolny ? el('span', { class: 'maly' }, 'By tier') : sortowanieKitu(kit)) : null,
    gracze.length > 3 ? kaskada(el('div', { class: 'karty-graczy' }, gracze.slice(3).map(g => kartaGracza(g, g.miejsce)))) : null,
    bliskoTieru(kit),
    ogolny ? rekordy() : null].filter(Boolean));
}

/** Rekordy serwera: z profili (cala historia) i z ostatnich walk (dane.mecze). */
function rekordy() {
  const gracze = Object.entries(dane.gracze).map(([nick, g]) => ({ nick, ...g.globalnie }));
  const naj = (lista, wartosc) => lista.reduce((a, b) => (wartosc(b) > wartosc(a) ? b : a), lista[0]);
  const wiersze = [];
  const dodaj = (opis, nick, wartosc, gdzie) => wiersze.push(el('div', { class: 'rekord' },
    el('span', { class: 'rekord-opis' }, opis, gdzie ? el('small', {}, gdzie) : null),
    nick ? linkGracza(nick, 48) : el('span'),
    el('b', { class: 'rekord-liczba num' }, wartosc)));
  if (gracze.length) {
    const w = naj(gracze, g => g.wygrane);
    if (w.wygrane) dodaj('Most wins', w.nick, w.wygrane);
    const s = naj(gracze, g => g.najlepszaSeria);
    if (s.najlepszaSeria) dodaj('Best win streak', s.nick, s.najlepszaSeria);
    const zKD = gracze.filter(g => g.wygrane + g.przegrane >= 10 && g.smierci);
    if (zKD.length) { const k = naj(zKD, g => g.zabojstwa / g.smierci); dodaj('Best K/D', k.nick, (k.zabojstwa / k.smierci).toFixed(2), 'at least 10 fights'); }
    const zWR = gracze.filter(g => g.wygrane + g.przegrane >= 10);
    if (zWR.length) { const r = naj(zWR, winrate); dodaj('Best win rate', r.nick, Math.round(winrate(r) * 100) + '%', 'at least 10 fights'); }
  }
  const ranked = dane.mecze.filter(m => m.ranked);
  if (ranked.length) {
    const strony = ranked.flatMap(m => [m.a, m.b]);
    const z = naj(strony, s => s.zmiana);
    if (z.zmiana > 0) dodaj('Biggest ELO gain in one fight', z.nick, ZNAK(z.zmiana), 'recent fights');
  }
  if (dane.mecze.length) {
    const pary = {};
    for (const m of dane.mecze) { const k = [m.a.nick, m.b.nick].sort().join(' vs '); pary[k] = (pary[k] || 0) + 1; }
    const [para, ile] = Object.entries(pary).sort((a, b) => b[1] - a[1])[0];
    dodaj('Biggest rivalry', null, ile + ' fights', para);
    const kity = {};
    for (const m of dane.mecze) kity[m.kit] = (kity[m.kit] || 0) + 1;
    const [kit, razy] = Object.entries(kity).sort((a, b) => b[1] - a[1])[0];
    dodaj('Most played kit', null, nazwaKitu(kit), razy + ' of the last ' + dane.mecze.length + ' fights');
  }
  if (!wiersze.length) return null;
  return el('section', { class: 'blisko' },
    el('h2', { class: 'sekcja-tytul wjazd' }, 'Server records'),
    el('p', { class: 'pod' }, 'The best numbers on MIO PVP so far.'),
    kaskada(el('div', { class: 'rekordy' }, wiersze)));
}

// ---------- TIERY ----------

/** Jak dzialaja tiery: drabinka 15 stopni z progami ELO, punktami i graczami, ktorzy teraz na niej stoja. */
function pokazTiery() {
  const { start, krok, kwalifikacje } = dane.progi;
  const naTierze = {};
  for (const k of dane.kity) for (const g of dane.rankingi[k.klucz]?.gracze || []) (naTierze[g.tier] ||= []).push({ nick: g.nick, kit: k.klucz });
  const zajete = Object.values(naTierze).reduce((s, l) => s + l.length, 0);
  const progElo = i => i === 0 ? `below ${start + krok}` : i === TIERY.length - 1 ? `${start + i * krok}+` : `${start + i * krok}–${start + (i + 1) * krok - 1}`;

  const drabinka = kaskada(el('div', { class: 'drabinka' }, [...TIERY].reverse().map(t => {
    const i = TIERY.indexOf(t);
    const gracze = naTierze[t] || [];
    return el('div', { class: 'szczebel ' + tierKlasa(t) },
      el('span', { class: 'szczebel-tier' }, t),
      el('span', { class: 'szczebel-elo num' }, progElo(i) + ' ELO'),
      el('span', { class: 'szczebel-pkt num' }, PUNKTY[t] + (PUNKTY[t] === 1 ? ' pt' : ' pts')),
      el('span', { class: 'szczebel-gracze' }, gracze.length
        ? gracze.slice(0, 6).map(g => el('a', { class: 'gracz', href: '#gracz/' + encodeURIComponent(g.nick), title: g.nick + ' · ' + nazwaKitu(g.kit) },
          glowa(g.nick, 48), g.nick, el('span', { class: 'maly' }, nazwaKitu(g.kit))))
        : el('span', { class: 'maly' }, 'Nobody yet')));
  })));

  tresc.replaceChildren(
    el('div', { class: 'baner' },
      el('div', {}, el('h1', {}, 'Tiers'),
        el('p', { class: 'pod' }, 'Every Ranked fight moves your ELO in that kit. Your ELO sets your tier, and your tiers add up to points in the overall ranking.')),
      el('div', { class: 'baner-liczba' }, el('b', { class: 'num' }, zajete), el('span', {}, 'tiers held right now'))),
    el('section', { class: 'jak' },
      el('div', {}, el('h2', { class: 'sekcja-tytul' }, 'Placements'),
        el('p', {}, `Your first ${kwalifikacje} Ranked fights in a kit are placements. After them you get your first tier in that kit.`)),
      el('div', {}, el('h2', { class: 'sekcja-tytul' }, 'ELO'),
        el('p', {}, `Everyone starts at ${start} ELO. Each tier is ${krok} ELO wide: L is low, M is mid, H is high, from tier 5 up to tier 1.`)),
      el('div', {}, el('h2', { class: 'sekcja-tytul' }, 'HT1'),
        el('p', {}, 'Only one player per kit can hold HT1: the one with the highest ELO. Anyone else that high stays at MT1.'))),
    el('h2', { class: 'sekcja-tytul wjazd' }, 'The ladder'),
    drabinka,
    el('section', { class: 'blisko' },
      el('h2', { class: 'sekcja-tytul wjazd' }, 'Titles'),
      el('p', { class: 'pod' }, 'Your points from all kits give you a title on your profile.'),
      kaskada(el('div', { class: 'lista tytuly' }, [...TYTULY].reverse().map(([od, nazwa], i, lista) => {
        const ile = Object.values(dane.gracze).filter(g => tytul(g.punkty) === nazwa).length;
        const doPunktow = i + 1 < lista.length ? lista[i + 1][0] - 1 : null;
        return el('div', { class: 'w' }, el('b', {}, nazwa),
          el('span', { class: 'num' }, od + (doPunktow === null ? '+ pts' : doPunktow === od ? ' pts' : '–' + doPunktow + ' pts')),
          el('span', { class: 'prawo maly' }, ile === 1 ? '1 player' : ile + ' players'));
      })))));
}

/** Gracze w kwalifikacjach: kto ile walk ma do tieru (w kicie albo we wszystkich kitach). */
function bliskoTieru(kit) {
  const prog = dane.progi.kwalifikacje;
  const wpisy = {};
  for (const k of dane.kity) {
    if (kit !== 'ogolny' && k.klucz !== kit) continue;
    for (const q of (dane.rankingi[k.klucz] || {}).kwalifikacje || []) (wpisy[q.nick] ||= []).push({ klucz: k.klucz, mecze: q.mecze });
  }
  const gracze = Object.entries(wpisy).map(([nick, kity]) => ({ nick, kity: kity.sort((a, b) => b.mecze - a.mecze) }))
    .sort((a, b) => b.kity[0].mecze - a.kity[0].mecze || a.nick.localeCompare(b.nick)).slice(0, 8);
  if (!gracze.length) return null;
  return el('section', { class: 'blisko' },
    el('h2', { class: 'sekcja-tytul wjazd' }, 'Close to a tier'),
    el('p', { class: 'pod' }, 'Players still in placements. You get a tier after ' + prog + ' Ranked fights in a kit.'),
    kaskada(el('div', { class: 'lista' }, gracze.map(g => el('div', { class: 'w' }, linkGracza(g.nick, 48),
      el('span', { class: 'prawo blisko-kity' }, g.kity.slice(0, 3).map(k => el('span', { class: 'kg-tier', title: nazwaKitu(k.klucz) },
        ikonaKitu(k.klucz), el('span', { class: 'num' }, k.mecze + '/' + prog)))))))));
}

function baner(nazwa, wRankingu, wszystkich) {
  return el('div', { class: 'baner' },
    el('div', {},
      el('h1', {}, nazwa),
      el('p', { class: 'pod' }, 'Tiers count only Ranked fights. Your first ' + dane.progi.kwalifikacje + ' fights in a kit are placements.')),
    el('div', { class: 'baner-liczba' }, el('b', { class: 'num' }, wRankingu),
      el('span', {}, 'ranked, out of ' + wszystkich + ' players')));
}

const MIEJSCA = [{ klasa: 'p1' }, { klasa: 'p2' }, { klasa: 'p3' }];

function podium(top) {
  // Kolejnosc na ekranie: 2, 1, 3 (zwyciezca w srodku).
  // Puste miejsce zostaje na podium jako zaproszenie, zeby uklad 2-1-3 sie nie rozpadal.
  return el('div', { class: 'podium' }, [1, 0, 2].map(i => {
    const g = top[i];
    const m = MIEJSCA[i];
    if (!g) return el('div', { class: 'podium-karta wolne ' + m.klasa },
      el('div', { class: 'podium-miejsce num', 'aria-label': 'Place ' + (i + 1) }, i + 1),
      el('div', { class: 'podium-nick' }, 'Open spot'),
      el('p', { class: 'wolne-opis' }, 'Finish ' + dane.progi.kwalifikacje + ' placement fights in any kit to stand here.'));
    return el('a', { class: 'podium-karta ' + m.klasa, href: '#gracz/' + encodeURIComponent(g.nick) },
      el('div', { class: 'podium-miejsce num', 'aria-label': 'Place ' + (i + 1) }, i + 1),
      el('img', { class: 'cialo', src: `https://mc-heads.net/body/${encodeURIComponent(g.nick)}/${i === 0 ? 210 : 150}`, alt: g.nick + "'s skin", loading: 'lazy' }),
      el('div', { class: 'podium-nick' }, g.nick),
      el('div', {}, el('span', { class: 'podium-liczba ' + (g.tier ? tierKlasa(g.tier) : 'num') }, g.liczba),
        el('span', { class: 'podium-jedn' }, g.jednostka === 'pkt' ? ' pts' : '')));
  }));
}

function kartaGracza(g, miejsce) {
  return el('a', { class: 'karta-gracza', href: '#gracz/' + encodeURIComponent(g.nick) },
    el('div', { class: 'kg-miejsce num' }, miejsce),
    glowa(g.nick, 64),
    el('div', { class: 'kg-srodek' },
      el('div', { class: 'kg-nick' }, g.nick),
      el('div', { class: 'kg-tiery' }, g.tiery
        ? dane.kity.filter(k => g.tiery[k.klucz]).map(k => el('span', { class: 'kg-tier ' + tierKlasa(g.tiery[k.klucz]), title: k.nazwa },
          ikonaKitu(k.klucz), g.tiery[k.klucz]))
        : [el('span', { class: 'num' }, el('span', { class: 'plus' }, g.gr.wygrane), ' / ',
          el('span', { class: 'minus' }, g.gr.przegrane), ' · ' + Math.round(winrate(g.gr) * 100) + '%')])),
    el('div', { class: 'kg-liczba' }, el('b', { class: g.tier ? tierKlasa(g.tier) : 'num' }, g.liczba), el('span', {}, g.jednostka)));
}

const SORTY = [
  { kol: 'elo', nazwa: 'Tier', wartosc: g => g.elo },
  { kol: 'winrate', nazwa: 'Winrate', wartosc: g => winrate(g) },
  { kol: 'wygrane', nazwa: 'Wins', wartosc: g => g.wygrane },
  { kol: 'nick', nazwa: 'Nick' },
];
const winrate = g => (g.wygrane + g.przegrane ? g.wygrane / (g.wygrane + g.przegrane) : 0);

function posortowane(lista) {
  const sort = SORTY.find(s => s.kol === sortowanie.kol) || SORTY[0];
  return [...lista].sort((a, b) => {
    if (sort.kol === 'nick') return (sortowanie.malejaco ? -1 : 1) * a.nick.localeCompare(b.nick);
    const roznica = sort.wartosc(b) - sort.wartosc(a);
    return (sortowanie.malejaco ? roznica : -roznica) || a.nick.localeCompare(b.nick);
  });
}

/** Przyciski sortowania nad lista kitu; drugi klik odwraca kolejnosc. */
function sortowanieKitu(kit) {
  return el('div', { class: 'mini-pig', style: 'margin:0' }, el('span', { class: 'maly', style: 'margin-right:6px' }, 'Sort:'),
    SORTY.map(s => el('button', {
      type: 'button', class: sortowanie.kol === s.kol ? 'akt' : null,
      onclick: () => {
        sortowanie.malejaco = sortowanie.kol === s.kol ? !sortowanie.malejaco : s.kol !== 'nick';
        sortowanie.kol = s.kol;
        pokazRanking(kit);
        tresc.classList.add('cisza'); // przy sortowaniu bez ponownego wjazdu podium
      },
    }, s.nazwa + (sortowanie.kol === s.kol ? (sortowanie.malejaco ? ' ▾' : ' ▴') : ''))));
}

// ---------- MECZE ----------

function wierszMeczu(m) {
  const strona = (s, prawa, wygral) => el('div', { class: 'strona' + (prawa ? ' prawa' : '') + (wygral === false ? ' przegrany' : '') },
    prawa && m.ranked ? el('span', { class: 'num ' + (s.zmiana >= 0 ? 'plus' : 'minus') }, ZNAK(s.zmiana)) : null,
    linkGracza(s.nick, 48),
    !prawa && m.ranked ? el('span', { class: 'num ' + (s.zmiana >= 0 ? 'plus' : 'minus') }, ZNAK(s.zmiana)) : null);
  const wynikA = m.wygral === null ? null : m.wygral === 'a';
  return el('div', { class: 'mecz' },
    el('span', {}, el('span', { class: 'plak ' + (m.ranked ? 'r' : 'u') }, m.ranked ? 'Ranked' : 'Unranked')),
    strona(m.a, false, wynikA),
    el('div', { class: 'wynik num' }, `${m.a.rundy} : ${m.b.rundy}`, el('small', {}, nazwaKitu(m.kit))),
    strona(m.b, true, wynikA === null ? null : !wynikA),
    el('div', { class: 'kiedy', title: new Date(m.czas).toLocaleString('en-GB') }, czasTemu(m.czas)));
}

const filtrMeczy = { typ: 'wszystkie', kit: 'wszystkie' };

function pokazMecze() {
  const ranked = dane.mecze.filter(m => m.ranked).length;
  const lista = el('div');
  const filtry = el('div', { class: 'filtry' });
  // Kity z ostatnich walk (moze byc tez kit spoza rankingu, np. lifesteal).
  const kity = [...new Set(dane.mecze.map(m => m.kit))];

  const rysuj = () => {
    const przycisk = (pole, wartosc, ...tresc) => el('button', {
      type: 'button', class: filtrMeczy[pole] === wartosc ? 'akt' : null, 'aria-pressed': String(filtrMeczy[pole] === wartosc),
      onclick: () => { filtrMeczy[pole] = wartosc; rysuj(); } }, ...tresc);
    filtry.replaceChildren(
      el('div', { class: 'mini-pig' }, przycisk('typ', 'wszystkie', 'All'), przycisk('typ', 'ranked', 'Ranked'), przycisk('typ', 'unranked', 'Unranked')),
      el('div', { class: 'mini-pig' }, przycisk('kit', 'wszystkie', 'All kits'),
        kity.map(k => przycisk('kit', k, ikonaKitu(k), nazwaKitu(k)))));
    const widac = dane.mecze.filter(m => (filtrMeczy.typ === 'wszystkie' || m.ranked === (filtrMeczy.typ === 'ranked'))
      && (filtrMeczy.kit === 'wszystkie' || m.kit === filtrMeczy.kit));
    lista.replaceChildren(widac.length ? kaskada(el('div', { class: 'mecze' }, widac.map(wierszMeczu)))
      : el('div', { class: 'karta pusto' }, 'No fights match these filters.'));
    obserwuj();
  };

  tresc.replaceChildren(...[
    el('div', { class: 'baner' },
      el('div', {}, el('h1', {}, 'Matches'), el('p', { class: 'pod' }, 'Latest fights on the server, Ranked and Unranked, with the ELO change for every Ranked fight.')),
      el('div', { class: 'baner-liczba' }, el('b', { class: 'num' }, dane.mecze.length), el('span', {}, 'recent fights, ' + ranked + ' of them Ranked'))),
    dane.mecze.length ? filtry : null,
    dane.mecze.length ? lista : el('div', { class: 'karta pusto' }, 'No fights yet. Join miopvp.com and play!')].filter(Boolean));
  if (dane.mecze.length) rysuj();
}

// ---------- PROFIL ----------

function pokazGracza(nick) {
  const klucz = Object.keys(dane.gracze).find(n => n.toLowerCase() === nick.toLowerCase());
  if (!klucz) {
    tresc.replaceChildren(el('div', { class: 'karta pusto', style: 'margin-top:24px' }, 'No such player: ', nick));
    return;
  }
  const g = dane.gracze[klucz];
  const naj = najlepszyTier(g);
  const gl = g.globalnie;
  const kd = gl.smierci ? (gl.zabojstwa / gl.smierci).toFixed(2) : String(gl.zabojstwa);
  const wr = Math.round(winrate(gl) * 100);
  const miejsce = miejsceOgolne(klucz);
  // Forma: ostatnie 10 walk (najnowsza z lewej), jak "recent form" na stronach z rankingami.
  const forma = g.mecze.slice(0, 10).map(m => {
    const ja = m.a.nick === klucz ? 'a' : 'b';
    const w = m.wygral === null ? ['D', 'remis', 'Draw'] : m.wygral === ja ? ['W', 'wygrana', 'Win'] : ['L', 'porazka', 'Loss'];
    const on = ja === 'a' ? m.b.nick : m.a.nick;
    return el('span', { class: 'forma-w ' + w[1], title: w[2] + ' vs ' + on + ' · ' + nazwaKitu(m.kit) }, w[0]);
  });

  const kity = kaskada(el('div', { class: 'kity' }, dane.kity.map(k => {
    const s = g.kity[k.klucz];
    return el('div', { class: 'kit' },
      el('div', { class: 'naz' }, ikonaKitu(k.klucz), k.nazwa,
        s && s.tier ? el('span', { class: 'maly num' }, '#' + miejsceWKicie(klucz, k.klucz)) : null),
      !s ? el('span', { class: 'kwal', style: 'opacity:.6' }, 'Not played')
        : s.tier ? plakietkaTieru(s.tier)
          : el('span', { class: 'kwal' }, `Placements ${s.kwalifikacje}/${dane.progi.kwalifikacje}`),
      el('div', { class: 'elo num' }, s && s.tier ? `${s.elo} ELO · ${s.wygrane}W/${s.przegrane}L` : '—'));
  })));

  const kityWykresu = dane.kity.map(k => k.klucz).filter(k => (g.wykres[k] || []).length);
  const miejsceWykresu = el('div');
  const przyciski = el('div', { class: 'mini-pig' });
  const pokazWykres = kit => {
    przyciski.replaceChildren(...kityWykresu.map(k => el('button', {
      type: 'button', class: k === kit ? 'akt' : null, onclick: () => pokazWykres(k) }, nazwaKitu(k))));
    miejsceWykresu.replaceChildren(rysujWykres(g.wykres[kit] || []));
  };
  if (kityWykresu.length) {
    const domyslny = naj && kityWykresu.includes(naj.klucz) ? naj.klucz : kityWykresu[0];
    pokazWykres(domyslny);
  } else {
    miejsceWykresu.append(el('div', { class: 'pusto' }, 'No Ranked fights since history started.'));
  }

  tresc.replaceChildren(
    el('div', { class: 'profil-top' },
      glowa(klucz, 192),
      el('div', {},
        el('h1', {}, klucz),
        el('p', { class: 'pod' },
          el('b', { class: 'tytul' }, tytul(g.punkty)), ' · ',
          miejsce ? ['#' + miejsce + ' overall · '] : null,
          naj ? ['best tier ', plakietkaTieru(naj.tier), ' ', nazwaKitu(naj.klucz), ' · '] : 'no tier yet · ',
          el('b', { class: 'wart' }, g.punkty + ' pts'))),
      el('div', { class: 'staty' },
        el('div', {}, el('b', {}, gl.wygrane), el('span', {}, 'Wins')),
        el('div', {}, el('b', {}, gl.przegrane), el('span', {}, 'Losses')),
        el('div', {}, el('b', {}, wr), el('span', {}, 'Win rate %')),
        el('div', {}, el('b', {}, kd), el('span', {}, 'K/D')),
        el('div', {}, el('b', {}, gl.najlepszaSeria), el('span', {}, 'Best streak')))),
    kity,
    el('div', { class: 'dwie' },
      el('div', { class: 'karta wykres' }, el('h2', { class: 'sekcja-tytul' }, 'Wins over time'), przyciski, miejsceWykresu),
      kaskada(el('div', { class: 'lista' },
        el('h2', { class: 'sekcja-tytul' }, 'Top rivals'),
        g.rywale.length ? g.rywale.map(r => el('div', { class: 'w' }, linkGracza(r.nick, 44),
          el('span', { class: 'prawo num' }, el('span', { class: 'plus' }, r.w), ' – ', el('span', { class: 'minus' }, r.l))))
          : el('div', { class: 'pusto' }, 'Nobody yet.')))),
    kaskada(el('div', { class: 'lista' },
      el('h2', { class: 'sekcja-tytul' }, 'Recent matches'),
      forma.length ? el('div', { class: 'forma', 'aria-label': 'Last ' + forma.length + ' fights, newest first' },
        forma, el('span', { class: 'forma-opis' }, 'Form in the last ' + forma.length + ' fights, newest first')) : null,
      g.mecze.length ?g.mecze.map(m => wierszProfilu(m, klucz)) : el('div', { class: 'pusto' }, 'No fights.'))));
}

function wierszProfilu(m, nick) {
  const ja = m.a.nick === nick ? m.a : m.b;
  const on = ja === m.a ? m.b : m.a;
  const wynik = m.wygral === null ? ['Draw', 'wart'] : (m[m.wygral] === ja ? ['Win', 'plus'] : ['Loss', 'minus']);
  return el('div', { class: 'w' },
    el('span', { class: 'plak ' + (m.ranked ? 'r' : 'u') }, m.ranked ? 'Ranked' : 'Unranked'),
    el('b', { class: wynik[1] }, wynik[0]),
    el('span', {}, 'vs '), linkGracza(on.nick, 44),
    el('span', {}, '· ' + nazwaKitu(m.kit) + ' '), el('span', { class: 'num' }, `${ja.rundy}:${on.rundy}`),
    el('span', { class: 'prawo' },
      m.ranked ? el('span', { class: 'num ' + (ja.zmiana >= 0 ? 'plus' : 'minus') }, ZNAK(ja.zmiana) + ' ') : null,
      el('span', { class: 'kiedy' }, czasTemu(m.czas))));
}

// ---------- WYKRES ----------

const SVG = 'http://www.w3.org/2000/svg';
function svg(tag, atrybuty) {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(atrybuty)) e.setAttribute(k, v);
  return e;
}

/** Wygrane Ranked narastajaco (kolejne walki rowno co punkt), os od 0. */
function rysujWykres(punkty) {
  if (punkty.length < 2) return el('div', { class: 'pusto' }, 'Not enough fights for a chart.');
  const W = 600, H = 180, M = 8;
  const max = Math.max(1, ...punkty.map(p => p[1]));
  const x = i => M + (i * (W - 2 * M)) / (punkty.length - 1);
  const y = v => H - M - (v * (H - 2 * M)) / max;
  const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', role: 'img', 'aria-label': 'Wins chart' });
  const d = punkty.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ');
  s.append(
    svg('path', { d: `${d} L${x(punkty.length - 1)},${H} L${x(0)},${H} Z`, opacity: '.12' }),
    svg('path', { d, fill: 'none', stroke: '#efeff1', 'stroke-width': 2.5, 'vector-effect': 'non-scaling-stroke' }));
  const ost = punkty[punkty.length - 1];
  s.append(svg('circle', { cx: x(punkty.length - 1), cy: y(ost[1]), r: 4, fill: '#efeff1' }));
  return el('div', {}, s, el('div', { class: 'kiedy', style: 'text-align:left' },
    `${punkty.length - 1} fights · ${ost[1]} wins`));
}

// ---------- ROUTER I START ----------

function pokaz() {
  const [widok, arg] = decodeURIComponent(location.hash.slice(1)).split('/');
  document.getElementById('nav-ranking').classList.toggle('akt', widok !== 'mecze' && widok !== 'tiery');
  document.getElementById('nav-mecze').classList.toggle('akt', widok === 'mecze');
  document.getElementById('nav-tiery').classList.toggle('akt', widok === 'tiery');
  if (widok === 'mecze') pokazMecze();
  else if (widok === 'tiery') pokazTiery();
  else if (widok === 'gracz' && arg) pokazGracza(arg);
  else pokazRanking(arg || 'ogolny');
  tresc.classList.remove('widok', 'cisza');
  void tresc.offsetWidth; // restart animacji pojawienia sie
  tresc.classList.add('widok');
  odliczanie();
  obserwuj();
  window.scrollTo(0, 0);
}

/** Szukanie po fragmencie nicku: najpierw dokladny, potem poczatek, potem srodek nicku. */
function znajdzGracza(tekst) {
  const t = tekst.toLowerCase();
  const nicki = Object.keys(dane?.gracze || {});
  return nicki.find(n => n.toLowerCase() === t) || nicki.find(n => n.toLowerCase().startsWith(t))
    || nicki.find(n => n.toLowerCase().includes(t)) || tekst;
}
document.getElementById('szukaj').addEventListener('submit', e => {
  e.preventDefault();
  const pole = document.getElementById('szukaj-pole');
  const nick = pole.value.trim();
  if (nick) { location.hash = '#gracz/' + encodeURIComponent(znajdzGracza(nick)); pole.value = ''; pole.blur(); }
});
// Skrot "/" przenosi do szukajki (jak na wiekszosci stron z rankingami).
addEventListener('keydown', e => {
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
  e.preventDefault();
  document.getElementById('szukaj-pole').focus();
});
document.getElementById('szukaj-pole').addEventListener('change', e => {
  if (dane && dane.gracze[e.target.value]) location.hash = '#gracz/' + encodeURIComponent(e.target.value);
});
litery(document.querySelector('.adres'));
document.querySelector('.adres').classList.add('wjazd');
obserwuj();
paralaksa();
document.querySelectorAll('.kopiuj-adres').forEach(b => b.addEventListener('click', () => {
  const przed = [...b.childNodes];
  navigator.clipboard?.writeText('miopvp.com').then(() => {
    b.textContent = 'Copied!';
    b.classList.add('skopiowano');
    setTimeout(() => { b.replaceChildren(...przed); b.classList.remove('skopiowano'); }, 1600);
  });
}));

/**
 * Gracze online z api.mcstatus.io (api.mcsrvstat.us nie widzi serwera przez tunel playit).
 * Liczbe pokazujemy tylko, gdy API potwierdzi, ze serwer dziala - falszywe "offline" byloby gorsze niz brak informacji.
 */
function online() {
  fetch('https://api.mcstatus.io/v2/status/java/miopvp.com')
    .then(r => r.json())
    .then(s => {
      const ile = s.online && s.players ? s.players.online : null;
      document.querySelectorAll('.online').forEach(e => {
        e.hidden = ile === null;
        // W pasku krotko ("3 online"), w stopce pelnym zdaniem.
        if (ile !== null) e.textContent = e.closest('.pasek') ? ile + ' online' : (ile === 1 ? '1 player online now' : ile + ' players online now');
      });
    })
    .catch(() => {});
}
online();
setInterval(online, 120000);

fetch('dane.json', { cache: 'no-store' })
  .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then(d => {
    // Nazwy kitow na stronie, ktore roznia sie od config.yml pluginu (tiery.kity), skad bierze je eksport.
    const NAZWY_KITOW = { diamondsmp: 'DSMP' };
    for (const k of d.kity) if (NAZWY_KITOW[k.klucz]) k.nazwa = NAZWY_KITOW[k.klucz];
    dane = d;
    document.getElementById('nicki').replaceChildren(...Object.keys(d.gracze).sort().map(n => el('option', { value: n })));
    document.getElementById('zaktualizowano').textContent = 'Updated ' + new Date(d.zaktualizowano).toLocaleString('en-GB');
    window.addEventListener('hashchange', pokaz);
    pokaz();
  })
  .catch(() => {
    tresc.replaceChildren(el('div', { class: 'karta pusto', style: 'margin-top:24px' }, 'Could not load the data, please refresh the page.'));
  });
