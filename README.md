# brichdesign — strona agencji

Statyczna strona (HTML + CSS + JS), bez budowania. Animacje: **GSAP + ScrollTrigger**, płynny scroll: **Lenis** (biblioteki ładowane z CDN).

## Struktura plików

```
brichdesign/
├── index.html            # cała treść i struktura sekcji
├── css/styles.css        # style (tokeny kolorów na górze pliku)
├── js/main.js            # animacje, generator lasu brzozowego, logika sekcji
├── assets/
│   ├── logo.svg          # logo poziome (znak + napis)
│   ├── favicon.svg       # ikona karty przeglądarki
│   └── previews/*.jpg    # podglądy 7 realizacji (zrzuty 1440 px)
└── README.md
```

## Uruchomienie

Wystarczy serwer statyczny (moduły nie są używane, ale podgląd z `file://` bywa kapryśny przy fontach):

```bash
cd brichdesign
python -m http.server 5190
```

Otwórz `http://localhost:5190`. Do wdrożenia wgraj cały folder na GitHub Pages / Netlify / Vercel / dowolny hosting.

## Co zmienić przed publikacją

- **Domena i e-mail** — w `index.html` sekcja `#kontakt` jest `hello@brichdesign.pl`. Domena `brichdesign.pl` była wolna w dniu sprawdzenia (2026-11-11); po rejestracji adres zacznie działać (np. przez przekierowanie e-mail do Gmaila).
- **Hierarchia realizacji** — kolejność i wielkość kafelków to ranking „co najbardziej rzuca się w oczy”: Karpik, NOCTE, PureDrive, Barańska, SOLUM, Furia; VK Cup jest tylko linijką „Starsze projekty”. Zmiana: klasy `card--xl / l7 / l5 / m6 / s` w `index.html` oraz tablica `projects` w `js/main.js`.
- **Zrzuty realizacji** — podmień pliki w `assets/previews/` (proporcje 16:10), gdy strony się zmienią.
- **Teksty projektów** — w `index.html` (kafelki) i w tablicy `projects` w `js/main.js` (karta w sekcji „Wejdź do środka”).

## Jak modyfikować animacje

Wszystko jest podpisane w `js/main.js`. Najważniejsze pokrętła są w obiekcie `CONFIG` na górze:

| Ustawienie | Efekt |
|---|---|
| `heroScroll` | jak długo hero jest przypięte (×wysokość okna) — dłużej = wolniejszy „wjazd” w las |
| `tourPerScene` | ile przewijania przypada na jedną realizację w sekcji „Wejdź do środka” |
| `smooth` | bezwładność scrolla (Lenis `lerp`; mniejsza liczba = płynniej/wolniej) |
| `leaves` | liczba spadających listków |

Inne miejsca:
- **Zoom lasu w hero** — blok `heroTl`: `scale` warstw `far` / `mid` / `near` (im większa różnica, tym silniejsza głębia).
- **Gęstość i wygląd brzóz** — obiekt `layers` (liczba pni, szerokość, kolory kory).
- **Lot scen w „wizycie”** — `farState` (stan oddalony) oraz wartości `scale/z/blur` w pętli `tourTl`.
- **Kolory poświaty tła scen** — zmienna `--g` w `index.html` (`.tour__glows i`).
- **Paleta strony** — zmienne `--ink`, `--bark`, `--leaf` na początku `css/styles.css`.
- Użytkownicy z włączonym „ogranicz ruch” w systemie dostają stronę bez Lenisa i bez spadających listków.

## Logo

Znak to litera „b”: pień brzozy (otwory w pniu = charakterystyczne poziome znaczenia kory), pierścień jako brzusiec litery i złoty listek wyrastający z czubka pnia. Źródło: `assets/logo.svg` oraz symbol `#bd-mark` w `index.html`.

## Wdrożenie (GitHub Pages + własna domena)

1. Repo `Szumi32/brichdesign` (publiczne), gałąź `main`, w Settings → Pages: *Deploy from a branch* → `main` / `(root)`.
2. Po kupnie domeny dodaj w repo plik `CNAME` z jedną linijką: `brichdesign.pl`, a w panelu domeny rekordy:
   - `A` dla `@` → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - `CNAME` dla `www` → `szumi32.github.io`
3. W Settings → Pages wpisz domenę i zaznacz *Enforce HTTPS* (certyfikat pojawia się po kilkunastu minutach).
4. Do kolejnych zmian: edytuj pliki, `git commit`, `git push`: Pages odświeża się samo.

Pliki pomocnicze: `robots.txt`, `sitemap.xml`, `404.html`, `.nojekyll`, `assets/og-image.jpg` (miniatura przy udostępnianiu linku). Adres `https://brichdesign.pl/` jest wpisany w `canonical` i `og:url`. Gdy wybierzesz inną domenę, podmień go w `index.html`, `robots.txt` i `sitemap.xml`.
