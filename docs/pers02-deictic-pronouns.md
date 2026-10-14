# PERS-02 — jawne zaimki podmiotu PL/EN

Parser i realizator obsługują `ja/ty/my/wy` oraz `I/you/we` jako deiktyczne podmioty. CORE przechowuje kotwicę `speaker` albo `addressee` oraz osobne cechy zgody gramatycznej. Nie tworzy z tych zaimków pojęć encji ani cech płci.

```json
{
  "version": "1.22",
  "type": "event",
  "concept": "event.movement",
  "roles": {
    "agent": {
      "referent": {"kind": "deictic", "anchor": "speaker"},
      "agreement": {"person": "first", "number": "singular"}
    }
  },
  "features": {"tense": "present", "polarity": "positive", "aspect": "unknown"}
}
```

Kontrolowane zdania `I go.` ↔ `Ja idę.`, `We go.` ↔ `My idziemy.`, `Ty idziesz.` ↔ `You go.` i `Wy idziecie.` ↔ `You go.` przechodzą analizę oraz realizację w obu kierunkach. Dla angielskiego `you` analiza zachowuje oba warianty liczby; tłumaczenie na polski zwraca `Ty` jako wynik główny i `Wy` jako jawną alternatywę.

Pierwsza i druga osoba korzystają z osobnej ścieżki parsera. Zaimki `he/she/on/ona` nadal należą do anafory trzeciej osoby i wymagają wcześniejszego, zgodnego referenta.

PERS-04 jest scalone: polskie paradygmaty generują i analizują ograniczony zestaw teraźniejszych form 1./2. osoby oraz form przeszłych. Pojedyncza forma przeszła wymaga rodzaju gramatycznego; bez tej cechy tłumaczenie odmawia wyboru. Pełna składniowa integracja czasu przeszłego pozostaje poza zakresem tej partii. W PERS-05 trwa obsługa angielskich uzgodnień `do/does`, przeczeń i pytań z jawnym zachowaniem `speaker`/`addressee` w PL↔CORE↔EN. Zaimki dopełnieniowe należą do osobnego zadania gramatycznego. Przeniesienie kotwicy między turami bez jawnego ID sesji kończy się `UNRESOLVED_DEIXIS`.

Testy i niezależne przykłady znajdują się w [pers02-deixis.test.js](../tests/pers02-deixis.test.js) i [pers02-deixis.json](../tests/fixtures/pers02-deixis.json).
