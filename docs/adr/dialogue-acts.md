# ADR: wersjonowane akty dialogowe w CORE

- **Status:** przyjęty dla semantycznego CORE; bez parsera ani realizacji PL/EN.
- **Wersja dokumentu:** 1.24 (dialogueActDocumentVersion).
- **Zakres:** assert, ask, answer, confirm, clarify, refuse.

## Kontekst

Zdarzenie opisuje treść semantyczną, ale samo nie wyraża, czy rozmówca coś
stwierdza, o coś pyta, odpowiada, potwierdza, prosi o doprecyzowanie czy odmawia.
W szczególności odpowiedź nie może być samotnym zdarzeniem bez pytania, na które
odpowiada. Wersja 1.24 dodaje więc oddzielną warstwę pragmatyczną ponad
istniejącymi dokumentami event, state i question.

## Format

Każdy dokument ma dokładnie cztery pola najwyższego poziomu:

~~~json
{
  "version": "1.24",
  "type": "dialogue_act",
  "act": "answer",
  "payload": {}
}
~~~

Pole act ma jedną z sześciu wartości. data/concepts.json deklaruje je jako
podtypy dialogue_act, a walidator wymaga zgodności z tą taksonomią.

| Akt | Dokładny payload | Warunki |
| --- | --- | --- |
| assert | { "proposition": <clause> } | Kompletne event, state, coordination, scope, complement lub modality. |
| ask | { "question": <question> } | Pytanie przechodzi dotychczasowy walidator 1.19, w tym jawny typ yes_no lub luka wh. |
| answer | { "question": <question>, "response": <typed response> } | Dla yes_no: { "type": "yes_no", "value": true\|false }. Dla wh: { "type": "referent", "value": <CORE participant> }. Uczestnik musi spełniać typ docelowej roli pytania. |
| confirm | { "question": <yes/no question> } | Jawne pozytywne potwierdzenie pytania tak/nie. |
| clarify | { "inReplyTo": <question or clause>, "question": <question> } | Zachowuje kontekst i zawiera konkretne pytanie doprecyzowujące. |
| refuse | { "question": <question>, "reason": <reason> } | Powód: ambiguous, insufficient_context, unsupported lub out_of_scope. |

Każdy payload ma dokładny zestaw pól z tabeli. Nieznane akty, wersje, pola,
niekompletne odpowiedzi, niezgodny typ odpowiedzi i uczestnik naruszający typ
roli są odrzucane. Pytania i odpowiedzi zachowują pełny dokument pytania jako
kontekst; nie wprowadzamy nietrwałych identyfikatorów ani domyślnego dopasowania
do zdarzeń.

Jeżeli odpowiedzi nie da się wypełnić poprawnym, typowanym payloadem, nie wolno
zastępować jej dowolnym event ani pustym answer. Nadawca wybiera clarify,
gdy może zadać pytanie uzupełniające, albo refuse z jawnym powodem. Walidator
sprawdza strukturę i typy, ale nie ocenia prawdziwości odpowiedzi ani stanu
wiedzy rozmówcy.

## Kontekst rozmowy i limity

DialogueContext przechowuje wyłącznie ograniczoną historię w pamięci procesu.
Domyślnie przyjmuje najwyżej **32 akty**; limit można obniżyć, nie można go
podwyższyć. ask otwiera pytanie. answer, confirm i refuse muszą wskazać
dokładnie aktualne pytanie w kontekście i je zamykają. clarify musi odnosić się
do aktualnego pytania, gdy takie istnieje; otwiera pytanie uzupełniające, a
odpowiedź na nie odsłania wcześniejsze pytanie. Stwierdzenia nie zamykają
otwartego pytania. Niepowodzenie walidacji lub sekwencji nie zmienia historii.

Pojedynczy dokument korzysta ze wspólnych limitów CORE: **200 000 UTF-16 code
units**, maksymalna głębokość **32** i maksymalnie **10 000 wartości** w
wejściowym JSON; graf INTER ma te same limity głębokości i liczby węzłów.
Sekwencja dyskursu złożona ze zdarzeń nadal ma odrębny limit **8 zdarzeń**.
Historia dialogowa nie jest zapisywana na dysku.

## Granice i konsekwencje

- engine.analyze({from:'core'}), engine.realize({to:'core'}) i
  engine.capabilities() obsługują oraz ogłaszają kontrakt 1.24.
- Zwykłe dokumenty CORE pozostają bez zmian.
- Realizacja aktów do polskiego lub angielskiego jest jawnie odrzucona. Ten ADR
  nie twierdzi, że gramatyki PL/EN rozpoznają lub wypowiadają akty dialogowe.
- Pola nie niosą tekstu źródłowego ani tłumaczenia. Zapisuje się znaczenie
  propozycji, pytania, odpowiedzi lub decyzji.
- validateInterlingua sprawdza jeden akt; DialogueContext dodatkowo sprawdza
  kolejność i powiązanie z pytaniem w bieżącej historii.

## Weryfikacja

tests/dialogue-acts.test.js sprawdza wszystkie akty, typowanie odpowiedzi,
zgodność roli WH, odrzucanie nieznanych i niekompletnych payloadów, roundtrip
CORE, brak realizacji PL/EN, powiązanie kolejnych tur i granice historii.
