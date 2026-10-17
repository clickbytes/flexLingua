# ADR: liczność semantyczna, kwantyfikacja i liczba gramatyczna

**Status:** Accepted; dokładna, ograniczona ilość 0–20 została wdrożona jako CORE event `1.34` w GEN-22. Operatorów i scope nie zaimplementowano.
**Data:** 2026-10-17.  
**Zakres:** rozdzielenie semantycznej liczności, operatorów kwantyfikacji i zakresu, policzalności sensu oraz wyboru wykładników gramatycznych.  
**Zależności:** GEN-06 / #184 oraz countability sensu z #174.  
**Poza zakresem:** implementacja nowego schematu, pełny rachunek kwantyfikatorów, swobodne rozstrzyganie niejednoznaczności przez model językowy.

## Decyzja

Przyjmujemy **model B**: w następnej wersji kontraktu CORE nominalna liczność i operatory kwantyfikacji będą odrębnymi, typowanymi strukturami; relacje zakresu będą jawne lub częściowo określone. Pakiet języka wyprowadzi liczbę gramatyczną, zgodę, przypadek, formę liczebnika i classifier z semantyki oraz reguł konkretnego języka.

Nie wolno wyprowadzać `singular`, `plural` ani `dual` bezpośrednio z samego operatora `universal` albo wartości liczebnika. Te same wartości semantyczne mogą mieć różne wykładniki i kontrolery uzgodnienia w różnych językach, a ten sam operator może wystąpić w konstrukcjach o różnych wzorcach zgody.

Istniejący CORE 1.0 pozostaje bez zmian i zachowuje obecną interpretację pól. Migracja jest osobnym zadaniem z nowym, jawnie wersjonowanym kontraktem oraz adaptacją starych dokumentów.

## Rozróżniane wymiary

| Wymiar | Znaczenie | Właściwa warstwa |
| --- | --- | --- |
| **Liczność / ilość semantyczna** | Liczba elementów denotowanych przez nominalną restrykcję, np. dokładnie 0, 1, 2 lub 5; dla nieokreślonej liczby pozostaje nieznana lub ograniczona, a nie zgadywana. | Wersjonowana reprezentacja nominalna CORE. |
| **Operator kwantyfikacji** | Operacja nad dziedziną i zakresem, np. `every`/`all` albo istnieniowe `a`; operator nie jest liczbą morfologiczną NP. | Węzeł semantyczny z wiązaną zmienną, restrykcją i zakresem. |
| **Policzalność sensu** | Czy wybrany sens rzeczownika zachowuje się jako `count`, `mass` lub `both`; własność może zmienić się między sensami tego samego leksemu. | Wybrany sens leksykalny, zgodnie z #174. |
| **Liczba gramatyczna i wykładnik** | Wybór form `singular`, `plural`, `dual`, count plural, nieodmiennej formy i zgodności dla danego języka oraz konstrukcji. | Profil i reguły gramatyczne pakietu języka; kontroler uzgodnienia jest jawny. |
| **Classifier / jednostka miary** | Wymagana lub preferowana jednostka konstrukcji liczebnikowej, dobierana według gramatyki i zgodności z rzeczownikiem. | Pakiet języka i jego reguły wyboru; nie globalna cecha liczby CORE. |

`unknown`, `absent`, `ambiguous` i `unsupported` pozostają rozróżnione. Brak wykładnika liczby w języku nie oznacza braku semantycznej liczności. Brak reguły dla classifiera nie uprawnia do wybrania dowolnego classifiera.

## Operator i zakres

Operator wymaga własnej restrykcji i zakresu; nie jest właściwością pojedynczego referenta. Przykładowe zdanie `Every girl saw a dog` dopuszcza co najmniej dwa odczytania:

1. `∀x [girl(x) → ∃y (dog(y) ∧ saw(x,y))]` — każda dziewczynka mogła zobaczyć innego psa.
2. `∃y [dog(y) ∧ ∀x (girl(x) → saw(x,y))]` — istnieje jeden pies, którego widziały wszystkie dziewczynki.

Jeżeli CORE nie ma dowodu na jeden porządek, zapisuje ograniczenia częściowe, które zachowują oba porządki. Nie wybiera odczytania z samej kolejności słów, częstotliwości ani preferencji modelu. Gdy odbiorca wymaga jednej interpretacji, wynik jest `AMBIGUOUS_SCOPE` do czasu uzyskania jawnego kontekstu lub wyboru. Jeśli liczba rozwinięć przekracza limit zasobów, adapter zgłasza jawny limit zamiast nieograniczonego rozwijania.

Docelowa struktura powinna wiązać każdy operator z identyfikatorem, zmienną, restrykcją i zakresem formuły. Nie narzucamy w tym ADR gotowego JSON-u ani implementacji MRS. MRS jest precedensem dla reprezentowania niedookreślonego zakresu, a nie wymaganiem przeniesienia całego tego formalizmu.

## Liczność nie jest wykładnikiem liczby

W angielskim konstrukcje te pokazują, że wartość ilości i zgoda są osobnymi decyzjami gramatyki:

| Ilość | Angielska konstrukcja | Lokalny wynik liczby |
| ---: | --- | --- |
| 0 | `Zero girls are here.` | rzeczownik plural, czasownik plural |
| 1 | `One girl is here.` | rzeczownik singular, czasownik singular |
| 2 | `Two girls are here.` | rzeczownik plural, czasownik plural |
| 5 | `Five girls are here.` | rzeczownik plural, czasownik plural |

Operator uniwersalny również nie ustala liczby gramatycznej. `Every girl is here` ma rzeczownik i czasownik w liczbie pojedynczej, podczas gdy `All girls are here` ma liczbę mnogą. CORE ma zachować kwantyfikację; angielska konstrukcja i jej kontrolery odpowiadają za wybór form.

Liczba `dual` może być wykładnikiem dla dokładnie dwóch denotowanych obiektów w języku, który ją stosuje. Nie jest jednak nazwą każdej morfologii liczebnikowej związanej z liczbą mnogą: m.in. bułgarski `count plural` po liczebnikach nie oznacza semantycznie dokładnie dwóch i nie powinien być oznaczany jako dual.

Polski dodatkowo pokazuje, że cecha NP, przypadek i zgoda czasownika nie muszą być tym samym wymiarem. W `Pięć kobiet stało` liczność wynosi pięć, rzeczownik występuje w dopełniaczu liczby mnogiej, a czasownik ma domyślną formę 3. osoby liczby pojedynczej rodzaju nijakiego. Wartość `plural` na uniwersalnym uczestniku nie wystarcza więc jako instrukcja fleksyjna.

## Countability i classifiers

Countability zostaje przy **wybranym sensie rzeczownika**, zgodnie z #174. Nie przenosimy jej do kwantyfikatora ani do zdania: rzeczownik może mieć różne sensy count/mass, a dozwolona liczba mnoga lub classifier może zależeć od wybranego sensu. `both` oznacza wyłącznie, że repo dopuszcza obie klasy dla tego konkretnego sensu; nie znaczy „zawsze pozwól na bare NP”.

W konstrukcji mandaryńskiej typu `sān běn shū` („trzy classifier książka”) ilość trzy pozostaje semantyczna, a dobór jednostki `běn` należy do gramatyki konstrukcji i selekcji między classifierem a rzeczownikiem. Adapter musi dobrać i walidować ten element lokalnie. Nie dopisujemy globalnego `number=classifier` ani nie wyciągamy liczby mnogiej z braku widocznego sufiksu.

## Zakres wdrożony i dalszy kontrakt

GEN-22 wdraża wersjonowany exact count `0..20`. Uczestnik wersji 1.34 zawiera `quantity: {kind:'exact', value}` i pomija gramatyczne `features.number`; parser i realizator pakietu języka wybierają lokalną liczbę oraz zgodę. Opt-in `nounPhrase.quantity` ma wersję `1.0`, `defaultNumber`, ograniczone `exactNumber` oraz listę classifierów przypisanych do istniejących pojęć rzeczowników. Każdy classifier ma lokalne warunki liczby/przypadka, statyczne formy i informację, czy jest wymagany; konflikty i nieobsługiwane cechy odrzucają pakiet. Classifier nie staje się pojęciem ani uczestnikiem CORE. W EN/PL dotychczasowe formy i serializacje legacy pozostają czytelne; toy profile pokazuje dual dla dokładnie dwóch.

Osobne zadanie nadal musi przed rozszerzeniem zakresu ustalić i wersjonować:

1. **Ilość nominalną poza exact 0–20**: ograniczone stany typu nieokreślonej liczby mnogiej; nie utożsamiać referenta zbiorowego z jednym, wymyślonym elementem.
2. **Graf kwantyfikacji**: typowany operator, zmienna, restrykcja, zakres i relacje częściowego porządku; walidacja odrzuconych odwołań, cykli i błędnych typów.
3. **Przeniesienie z legacy**: bezstratne czytanie obecnego CORE 1.0; migracja jawna i opisana. Nie reinterpretować `participant.features.number` w miejscu.
4. **Most do języka**: dalsze reguły wyboru kontrolera uzgodnienia, przypadka, form liczebników, classifiera/jednostki oraz strategii języka bez oznaczania ich jako niezmienników CORE.
5. **Countability**: reuse pola sensu z #174; walidacja `mass/count/both` pozostaje leksykalna i niezależna od zakresu zdania.
6. **Granice**: skończone limity złożoności zakresu i jawne kody ambiguity/unsupported/resource limit. Pełny theorem prover i nieograniczone rozstrzyganie scope są poza MVP.

Przy nowych goldach trzeba sprawdzać oba kierunki i roundtrip CORE. Expected CORE i target surface należy napisać niezależnie od silnika. Odczytania zakresu muszą być niezależnymi goldami; zgodny string nie jest dowodem zachowania scope.

## Stan obecny i regresje

Legacy `participant()` w `js/core/interlingua.js` nadal łączy `features.number` z `quantifier`; walidator zachowuje dawne reguły `exact=1 → singular`, `exact!=1 → plural` i `universal → plural`. Event `1.34` używa osobnego `quantity` i nie przenosi `dual` do `data/features.json`. Opcjonalna gramatyka ilości mapuje liczbę exact na lokalną formę rzeczownika, agreement i classifier; niepełne profile odmawiają zamiast zgadywać.

`tests/space05-numbers-time.test.js` utrwala dokładne ilości 0–20 i powyższe mapowanie liczby; `tests/qualifiers.test.js` utrwala exact=2, universal i walidację wartości. Oba pliki są **legacy-compatible** i nie powinny być zmieniane przez ten spike. `tests/semantics.test.js` pozostaje ogólną regresją semantyczną; nie stanowi niezależnego golda obu zakresów `∀/∃`. Pełny oracle scope należy dodać dopiero do implementacyjnego issue.

Celowany przebieg na bazowym kodzie: `node --test tests/qualifiers.test.js tests/space05-numbers-time.test.js tests/semantics.test.js` — **PASS, 48/48**. W tym issue nie wprowadzono zachowania runtime.

## Rozważone alternatywy

| Model | Ocena |
| --- | --- |
| **A. Dalsze rozszerzanie `participant.quantifier` i `features.number`** | Odrzucony. Nadal miesza cardinality, scope operatora i wykładnik językowy, więc nie reprezentuje poprawnie dwóch odczytań `∀/∃`. |
| **B. Osobny model ilości i zakresu + dobór cech przez gramatykę** | **Przyjęty.** Zachowuje semantykę w CORE, a przypadek, zgodę i morfologię mapuje w ograniczonym profilu języka. Pozwala zachować scope częściowy bez zgadywania. |
| **C. Wymaganie ręcznego wyboru każdej niejednoznaczności** | Odrzucony jako format bazowy. Niepotrzebnie blokuje zapis poprawnie rozpoznanej, ale niedookreślonej treści. Wymagany wybór pozostaje zachowaniem konsumenta, który potrzebuje jednego rozstrzygniętego odczytania. |

## Źródła

- Copestake, Flickinger, Pollard i Sag (2005), [Minimal Recursion Semantics: An Introduction](https://www.cl.cam.ac.uk/~aac10/papers/mrs.pdf) — niedookreślenie relacji scope i alternatywne odczytania kwantyfikatorów.
- Universal Dependencies, [Number](https://universaldependencies.org/u/feat/Number.html) — rozróżnienie `Dual` od `Count` (count plural, niezwiązany semantycznie z dwoma).
- Patejuk i Przepiórkowski (2012), [The Puzzle of Case Agreement](https://web.stanford.edu/group/cslipublications/cslipublications/LFG/17/papers/lfg12przpat2.pdf) — polskie `Pięć kobiet stało` oraz rozdział formy rzeczownika, przypadku i zgody.
- Drożdż (2020), [New insights into English count and mass nouns](https://www.cambridge.org/core/journals/english-language-and-linguistics/article/new-insights-into-english-count-and-mass-nouns-the-cognitive-grammar-perspective/F61D8BDD4C8F791FF264F7F4EAA23C51) — count i mass mogą być własnością odrębnych sensów leksemu.
- Zhang (2011), [The Constituency of Classifier Constructions in Mandarin Chinese](https://www.researchgate.net/publication/287720955_The_constituency_of_classifier_constructions_in_mandarin_Chinese) — struktury numeral + jednostka/classifier + rzeczownik i selekcja jednostki.
