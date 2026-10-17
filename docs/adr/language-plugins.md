# ADR: języki jako pluginy JavaScript

- **Status:** Accepted.
- **Data:** 2026-10-17.
- **Decyzja:** PLUG-RESET #234 / PLUG-R01 #235.
- **Punkt odniesienia wykonania:** `main@b75f0ca39e6fd1a18f6e4cf5e4e679ab0943c45d`.
- **Zakres:** docelowy kontrakt języka, LanguageGraph, wspólny CORE i CLI.
- **Poza zakresem:** implementacja loadera, grafu, migracja danych i usuwanie runnerów; realizują je osobne issues.

## Kontekst

Obecny runtime rejestruje adaptery składni i morfologii, a pliki językowe są
rozproszone między `js/languages/`, `data/languages/`, pliki leksykalne w `data/`
oraz `data/grammar/` i `data/morphology/`. Ręczna ocena nie ma jeszcze jednego
CLI. Sam podział plików nie gwarantuje, że capability manifestu odpowiada temu,
co parser i realizator rzeczywiście potrafią.

Decyzja dotyczy końcowego układu docelowego: JavaScript ESM i JSON, wspólny CORE,
języki ładowane jako pluginy oraz jedno CLI do ręcznego przeglądu zdań. To
świadomy cutover. Nie utrzymujemy dwóch aktywnych źródeł prawdy, starych
adapterów zgodności ani wersjonowanych nazw `v2`.

## Decyzja

1. Każdy pakiet językowy jest katalogiem `languages/<code>/`. Jego `index.js`
   eksportuje jeden `LanguagePlugin`; `manifest.json` identyfikuje pakiet,
   `graph.json` przechowuje jego typowane LanguageGraph, a istniejące dane
   gramatyczne, leksykalne i morfologiczne pozostają osobnymi modułami, gdy są
   potrzebne.
2. `js/core/` przechowuje językowo neutralne znaczenia, ontologię, wspólny
   `Engine` i generyczne interpretery. `js/plugins/` odpowiada za kontrakt,
   registry, loader, walidację grafu i kompilację pluginu.
3. `MeaningGraph` jest jedyną reprezentacją znaczenia między analizą źródła a
   realizacją celu. LanguageGraph opisuje zasoby i reguły konkretnego języka;
   nie kopiuje konceptów CORE ani nie zastępuje MeaningGraph.
4. Plugin udostępnia `describe()` i `capabilities()`. Capability zdaniowe
   wymagają odpowiedniego `analyze()` lub `realize()`; plugin morphology-only
   może pominąć obie metody zdaniowe. `morphology`, `lexicon` i `signal` są
   opcjonalnymi providerami; ich brak oznacza brak capability, nie pusty plik
   udający implementację. Morfologia może dodatkowo udostępnić `inventory()` i
   `describe()` dla narzędzi budujących skończoną tabelę; nie zastępują one
   operacji `generate()`, `analyze()`, `paradigm()` ani `availability()`.
5. Wspólny runtime nie rozgałęzia się po kodzie języka, aby realizować
   morfologię lub składnię. Registry może użyć `code` do wyboru pluginu; dalsze
   decyzje pochodzą z graphu, modułów danych i funkcji deklarowanych przez
   plugin.
6. Brak obsługi jest jawnym wynikiem. Nieznane dane są `invalid`; znana, ale
   niedostępna konstrukcja jest `unsupported`; ograniczenia zasobów są
   `resource_limit`. Parser nie naprawia ich heurystycznie. Nie zmieniamy ról
   CORE na funkcje składniowe ani nie gubimy diagnostyk transferu.
7. `node tools/translate.mjs` jest jedynym interfejsem bieżącej ręcznej oceny
   zdań po ukończeniu R07. Ręczny odbiór sprawdza zdanie, intencję/znaczenie,
   CORE, wynik lub odmowę i alternatywy. Nie nazywa się go automatycznym testem
   ani dowodem pełnego CEFR. Stan prac i komendy zapisuje się w issue/PR;
   workflow nie używa Actions jako bramki ani pliku `HANDOFF.MD`.

## Kontrakt pluginu

Kontrakt jest synchronicznym API ESM. Loader może używać asynchronicznego
odczytu plików, ale wywołania parsera i realizatora nie wymagają serwera ani
zewnętrznego procesu.

```js
export default {
  contractVersion: '1.0',
  code: 'pl',
  describe() { return { language: 'pl', version: '1.0' }; },
  capabilities() { return [
    { operation: 'analyze', channel: 'sentence',
      construction: 'controlled-event-present', status: 'implemented',
      evidence: [{ kind: 'manual-sentence', id: 'pl-controlled-present-01' }] },
    { operation: 'realize', channel: 'sentence',
      construction: 'controlled-event-present', status: 'implemented',
      evidence: [{ kind: 'manual-sentence', id: 'pl-controlled-present-01' }] }
  ]; },
  analyze({ text, context = {} }) {
    return { status: 'ok', readings: [{ meaning: {} }], diagnostics: [] };
  },
  realize({ meaning, context = {} }) {
    return { status: 'ok', text: '…', alternatives: [], warnings: [],
      diagnostics: [], informationLoss: [] };
  }
};
```

Przykład pokazuje kształt, a nie poprawne znaczenie dla zdania. `analyze()`
zwraca ograniczone odczytania. Przy wielu nierozstrzygniętych odczytaniach zwraca
`ambiguous` i jawne alternatywy zamiast udawać pewność. `realize()` w stanie
`unsupported`, `invalid` lub `resource_limit` nie zwraca tekstu jako sukcesu.
Obie operacje zwracają `diagnostics[]`; każdy wynik realizacji jawnie zawiera
`alternatives[]`, `warnings[]` i `informationLoss[]`. Pusta tablica strat oznacza
brak wykrytej straty w obsługiwanym zakresie, a nie gwarancję pełnej jakości.
Diagnostyka transferu nie zmienia grafu znaczenia.

Dozwolone statusy wyniku to `ok`, `ambiguous`, `unsupported`, `invalid` oraz
`resource_limit`. Każdy diagnostic ma stabilny `code` i czytelny `message`;
szczegółowe wymagane pola oraz walidację określa `js/plugins/contract.js`.
Capabilities są listą deklaracji per operacja, kanał i konstrukcja. Każda
deklaracja ma status `implemented` lub `unsupported` oraz dowód w postaci
ręcznie sprawdzonego zdania albo ręcznej odmowy; ogólne `all` jest niedozwolone.

## LanguageGraph

LanguageGraph jest wersjonowanym, serializowalnym grafem deklaracji jednego
pakietu. Dokument ma `schemaVersion`, `language`, `nodes[]` i `edges[]`.
Każdy węzeł ma stabilne ID, typ i walidowane dane tego typu; każda krawędź ma
typ, `from` i `to`, a jej końce muszą wskazywać istniejące węzły właściwych
typów. Przykładowe typy węzłów to lexeme, sense, feature, construction, role
binding, form i capability. Przykładowe krawędzie to `realizes`, `licenses`,
`maps-role` i `requires-form`. Zamknięte enumy, kształty węzłów i dozwolone
pary krawędzi stanowią implementacyjny kontrakt R04; niedozwolone krawędzie
muszą być odrzucane.

```json
{
  "schemaVersion": "1.0",
  "language": "toy",
  "nodes": [
    {"id": "construction.svo", "type": "construction"},
    {"id": "lexeme.book", "type": "lexeme"}
  ],
  "edges": [
    {"type": "licenses", "from": "construction.svo", "to": "lexeme.book"}
  ]
}
```

To minimalna ilustracja typowanego grafu, nie gotowy manifest supportu ani
pełna walidacja semantyczna. Graf nie zawiera wykonywalnego kodu i nie może
referować dowolnych ścieżek systemowych. `index.js` może składać dane przez
zatwierdzone factory/providers JavaScript, ale nie wprowadza reguł konkretnego
języka do wspólnego interpretera.

## Wspólny CORE i wcześniejsze decyzje

- Reuse [ogólny kontrakt cech i transferu](generic-language-feature-contract.md):
  językowy profil cech, jawne mapowania ról na argumenty i capability evidence.
  Nie rozszerzać `data/core/features.json` o sumę wszystkich morfologii.
- Reuse [liczność i liczba gramatyczna](quantification-grammatical-number.md):
  ilość semantyczna pozostaje odrębna od liczby i uzgodnienia w pakiecie.
  Operatorów i scope nie deklarować jako zaimplementowanych bez osobnego
  kontraktu.
- Reuse [tożsamość referenta i wzmianki](referent-vs-mention.md):
  tożsamość wymaga jawnego linku; graf języka i leksykon nie mogą dopowiadać
  referenta z podobieństwa form.
- Reuse [aktualny kontrakt CLI](../cli.md):
  jawna utrata powierzchniowa jest wynikiem transferu, nie mutacją CORE.

## Właścicielstwo plików i cutover

| Obecne źródło | Docelowy właściciel |
| --- | --- |
| `data/concepts.json` | `data/core/concepts.json` |
| `data/features.json` | `data/core/features.json`, tylko cechy wspólne CORE |
| `data/provenance.json` | `data/core/provenance.json` oraz provenance pakietów |
| `data/{en,pl,fi,tr,it}.json` | `languages/<code>/lexicon.json` |
| `data/grammar/<code>.json` | `languages/<code>/grammar.json`; deklaracje graphu w `graph.json` |
| `data/morphology/<code>.json`, `ar-lexicon.json` | opcjonalne `morphology.json` i `morphology-lexicon.json` danego pakietu |
| `data/morphology/features.json` | profil form lokalny dla właściwego `languages/<code>/features.json` |
| `data/languages/<code>.json` | `languages/<code>/manifest.json` |
| `js/languages/{en,pl,tr,it}.js` | `languages/<code>/index.js`; FI nie ma obecnie takiego wrappera, AR nie ma parsera zdań |
| `tools/review-sentences.mjs` | zastąpiony przez `tools/translate.mjs`; bez aliasu zgodności |
| `index.html`, `js/main.js`, `js/ui/`, `start.bat` | wyłączone/usunięte przez wskazany cleanup CLI-only, nie przenoszone do pluginu |
| `tests/`, stare goldy i runner npm | usuwane dopiero po działającym CLI i ręcznym odbiorze odpowiednich pluginów |

Docelowe katalogi językowe obejmują `pl`, `en`, `fi`, `tr`, `it` i `ar`.
`ar` może dostarczać wyłącznie morphology provider; nie deklaruje analizy ani
realizacji zdań. `fi`, `tr` i `it` deklarują tylko ograniczony zakres, który
rzeczywiście został podłączony. Nie tworzyć pustych modułów opcjonalnych.

Cutover przebiega kolejno: R01 kontrakt, R02 publiczny API i odmowy, R03
registry/loader, R04 LanguageGraph, R05 declarative runtime i semantic bridge,
R06 przepięcie Engine, R07 CLI, R08 wspólna gramatyka/nominale, R09
morfologia/leksykon; następne issues przenoszą pluginy, usuwają stare ścieżki i
przeprowadzają ręczny odbiór. Stary plik usuwa się dopiero wtedy, gdy importy
zostały przepięte, bez pozostawiania adaptera zgodności.

## Odrzucone warianty

- **Adaptery równoległe bez terminu usunięcia:** utrzymują dwa źródła prawdy i
  pozwalają klientom omijać nowy kontrakt.
- **Kod języka w `js/core/`:** rozprasza implementację po parach językowych i
  utrudnia wykrycie nieobsługiwanej funkcji.
- **Capability tylko z manifestu:** deklaracja bez grafu, interpretera i
  ręcznie sprawdzonego przykładu jest obietnicą, nie dowodem działania.
- **TypeScript, nowy framework lub serwer:** nie są potrzebne dla synchronicznego
  ESM/JSON runtime i CLI.

## Konsekwencje

Każdy plugin może być walidowany i ładowany osobno; wspólny CORE nie importuje
danych językowych. Cutover wymaga czasowej koordynacji przenoszenia plików,
ponieważ stary browser bootstrap i narzędzia mają bezpośrednie importy. Po
przepięciu ostatniego klienta nie utrzymujemy ich jako fallbacku. W czasie
migracji ograniczenia i nieprzeniesione funkcje muszą kończyć się jawną odmową.
