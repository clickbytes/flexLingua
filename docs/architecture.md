# Architektura flexLingua

## Przepływ tłumaczenia

```mermaid
flowchart LR
  CLI[tools/translate.mjs] --> R[PluginRegistry]
  R --> L[walidowany loader]
  L --> S[LanguagePlugin źródłowy]
  S -->|analyze| M[MeaningGraph]
  M --> T[LanguagePlugin docelowy]
  T -->|realize| CLI
  CORE[data/core/concepts.json] --> O[Ontology / typowane definicje konceptów]
  O --> M
```

CLI rozwiązuje pakiety przez registry. Plugin źródłowy analizuje zdanie do neutralnego znaczenia, a plugin docelowy realizuje to znaczenie w swoim zakresie. Wynik zawiera tekst albo jawną odmowę, CORE i diagnostykę. Obecność leksemu lub reguły w danych nie dowodzi obsługi całej konstrukcji.

Import snapshotu pamięci sesji jest ograniczony rozmiarem i strukturą, a każda zapisana propozycja jest ponownie walidowana względem ontologii i rejestru cech aktywnego Engine. Cały snapshot przechodzi walidację przed zastąpieniem pamięci; niepoprawne znaczenie lub graf pozostawia dotychczasowy stan sesji bez zmian.

CORE definiuje stabilne koncepty i ich opcjonalne, typowane grafy znaczenia. Ontology wiąże te definicje z `coreRef`; MeaningGraph zachowuje role zdania, referenty i cechy. Ten graf semantyczny jest odrębny od LanguageGraph, który opisuje połączenia modułów w pakiecie języka. Kontrakt grafu opisuje [ADR typowanego grafu definicji konceptu](adr/typed-semantic-graph.md); jego walidacja i projekcja są ograniczonymi capability, a nie deklaracją pełnego pokrycia języka.

Analiza źródłowa może zachować bounded surface evidence w LanguagePlugin, po czym istniejący bridge mapuje rozpoznane sloty do walidowanego MeaningGraph; plugin docelowy realizuje ten graf według własnej licencjonowanej kolejności. Ślad szyku pozostaje poza CORE i sam nie określa topic/focus. Szczegóły opisuje [ADR wariantów szyku](adr/feature-driven-word-order.md).

Macierz wiąże zatwierdzone powierzchnie relacjami `same-core` i `different-core`: para polskich SVO/OVS powinna zachować te same role dzięki przypadkom, a angielskie SVO z zamienionymi uczestnikami powinno utworzyć inny MeaningGraph. To sprawdza mapowanie slotów dla zadeklarowanych konstrukcji; nie upoważnia do dowolnych permutacji, wnioskowania topic/focus ani do zmiany kolejności realizacji po stronie celu. Oczekiwane role, cechy, kontrolowane odmowy i straty informacji należą do niezależnie zatwierdzonych cases w [macierzy zdań](../tests/README.md).

## Własność warstw

```text
js/
  core/       wspólny Engine, MeaningGraph/CORE i interpretery
  plugins/    kontrakt, walidacja, registry, loader i LanguageGraph
languages/
  registry.json
  <code>/
    index.js manifest.json graph.json
    lexicon.json grammar.json features.json
    morphology.json morphology-lexicon.json signal.json provenance.json
data/
  core/       wspólna ontologia, cechy CORE i provenance
tools/
  translate.mjs
examples/
  cli-sentences.md
```

Dane języka poza `index.js`, `manifest.json` i `graph.json` są opcjonalne. Pakiet deklaruje tylko moduły, które istnieją i których używa. Registry i loader walidują pakiety przed udostępnieniem ich CLI.

## Granice semantyki i języka

- CORE przechowuje znaczenia i role, nie szyk zdania ani przypadek gramatyczny.
- LanguageGraph przechowuje typowane, ograniczone dane danego języka i ich powiązania.
- LanguagePlugin łączy graph oraz opcjonalne moduły ze wspólnym runtime; nie tworzy reguł osobno dla każdej pary języków.
- Manifest deklaruje status, kierunki i capability per operacja i konstrukcja. Deklaracja musi odpowiadać działającemu providerowi.
- Odmowa, wieloznaczność i utrata informacji są jawne. Brak modułu lub kierunku nie uruchamia starego fallbacku.
- Dane i licencje pozostają w provenance wspólnego CORE lub odpowiedniego pakietu.

## Aktualny zakres

Pakiety obsługują kontrolowane podzbiory PL↔EN i EN↔FI, kierunek TR→EN oraz kierunek IT→EN. AR jest pakietem morphology-only i odmawia tłumaczenia zdań. Szczegółowe kierunki i konstrukcje należy odczytywać z manifestów i weryfikować przez [CLI](cli.md).

Obecne interfejsy aplikacji to lokalne TUI oraz samodzielne Node CLI. TUI używa wspólnego runtime aplikacji z jednym Engine i PluginRegistry w procesie; CLI pozostaje osobnym, nieinteraktywnym punktem wejścia. CLI służy do akceptacji zachowania zdań, a TUI udostępnia te same ograniczone usługi przez zakładki Translate, Chat i Forms.
