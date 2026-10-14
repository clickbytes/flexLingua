# A1 / Batch 2 — audyt luk kontrolowanego języka

**Data:** 2026-10-14. Pliki: `data/coverage/a1-targets.json`, `tools/a1-gap-audit-lib.mjs`, `tools/a1-gap-audit.mjs`, `tests/a1-gap-audit.test.js`.

**Cel:** utrzymywać audyt luk dla autorskiego zestawu 23 celów (historycznie 22 przed Batch 6) w sześciu obszarach. Od VAL-01 macierz v2 jawnie rozróżnia pojęcia od konstrukcji, przechowuje `scopeStatus` oraz wymagania CORE/PL/EN/morfologii/ram. To podzbiór projektu, a nie licencjonowany wzorzec Oxford ani komplet CEFR A1. Nie wyliczać z niej „procentu A1”. Zob. [zamrożony zakres](a1-scope.md).

```sh
npm run audit:a1-gaps
npm run audit:a1-gaps -- --output /tmp/a1-gaps.json
```

Raport JSON osobno oznacza dla każdego celu: `ontologyPresent`; połączenia leksykalne PL/EN; przypisanie paradygmatu w PL/EN; obecność deklaracji ram gramatycznych dla predykatów; oraz niezależną próbkę gold (`observedIds`, `passedIds`, `failedOrMissingIds`). Stan `pilot-exercised` to **dowód przejścia kilku sprawdzeń w próbce**, a nie ogólna umiejętność językowa. Braki nie są ukrywane, nawet jeśli jakiś tekst udało się przetłumaczyć.

**Luki bazowe:** `event.movement` ma CORE i angielską deklarację, ale nie polskie pokrycie leksykalne/gramatyczne; `person.sister`, `person.brother`, `event.read`, `event.help` są nazwane jako oczekujące na nowy CORE w kolejnym batchu. `person.father` pozostaje planowany. Po dodaniu nowych reguł audyt sam zmieni status z `unmodelled` na strukturalne/empiryczne etapy, **bez ręcznego wpisywania sukcesu**.

Zestaw 40 testów G2/G3 służy jako źródło zweryfikowanych prób; jeżeli jakikolwiek pozytywny gold zacznie się nie zgadzać, CLI kończy się błędem, nie wypisuje pozornie zielonego audytu. W chwili sporządzenia raportu pełny Node checkout i Actions nie były zweryfikowane; późniejsze pełne testy i hosted release runy przeszły. Standalone zostało wycofane. `cefr.percentage` jest stale `null`.

## Zmiany po Batch 3 — osobny gold rodziny i czynności

Dodanie `person.sister`, `person.brother`, `event.read` i `event.help` przenosi te cztery cele z `unmodelled` do **`without-gold`** w raporcie `audit:a1-gaps`: model CORE, słownik PL/EN, morfologia i ramy już istnieją, lecz ten raport celowo porównuje tylko niezależny G2 `data/coverage/a1-gold-g2.json`. Nowe 16 zdań, 18 komórek fleksyjnych i 4 odmowy mają własny, oddzielny oracle `tests/fixtures/gold-family-actions-a1.json` oraz `npm run check:gold-family`. Nie oznaczamy ich jako sprawdzonych przez **G2**, ponieważ nie są w tej próbce. `person.father` pozostaje bez definicji CORE, `event.movement` bez pokrycia PL.

Test regresyjny Batch 2 uaktualniono, by sprawdzał tę zmianę statusu i brak ukrywania wciąż istniejących luk. Integracja wielu niezależnych korpusów w jeden audyt jest osobnym zadaniem po stabilizacji CI; do tego czasu oba wyniki trzeba czytać łącznie.

## Batch 4 — nowa leksyka ojciec/father

`person.father` ma już CORE, obie strony słownika i paradygmaty. Jeśli audyt ograniczony do G2 nadal raportuje `without-gold`, sprawdzić odrębny oracle `check:gold-father`. To nie jest całkowite pokrycie A1.

## Automatyczne uaktualnienie Batch 4

Po dodaniu `ojciec/father` stare asercje `person.father=unmodelled` byłyby nieaktualne. Nowy stan w zamrożonym G2 to `without-gold` (pełne CORE/PL/EN/morfologia, brak przykładów *w korpusie G2*). Oddzielny oracle Batch 4 zawiera jednak 16 dwukierunkowych zdań i pełną deklinację. Testy audytu odzwierciedlają obie rzeczy.

## Po Batch 5

`event.movement` uzyskuje PL leksykę, morfologię i ramę. W zamrożonym gold G2 ma `without-gold`, lecz odrębny zestaw ruchu zawiera 18 przykładów. Stare testy sprawdzające brak ruchu w PL zostały zaktualizowane.

## Batch 6: 23 cele i daily actions

Dodano `event.open` do autorskiej listy celów i uzupełniono `event.write` o obie leksyki, morfologię i ramy. 23 cele nie są oficjalną bazą CEFR. Zamrożony G2 raportuje nowe zdarzenia jako `without-gold`; ich osobny oracle weryfikujemy przez `check:gold-actions`.
