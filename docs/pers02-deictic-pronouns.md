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

Aktualny zakres obejmuje kontrolowane zdania oznajmujące w czasie teraźniejszym. Pierwszo- i drugioosobowy czas przeszły po polsku czeka na zweryfikowane formy i bezpieczne uzgodnienie; zaimki dopełnieniowe należą do osobnego zadania gramatycznego. Przeniesienie kotwicy między turami bez jawnego ID sesji kończy się `UNRESOLVED_DEIXIS`.

Testy i niezależne przykłady znajdują się w [pers02-deixis.test.js](../tests/pers02-deixis.test.js) i [pers02-deixis.json](../tests/fixtures/pers02-deixis.json).
