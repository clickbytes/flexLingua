import {COMMAND_DEFINITIONS, commandAvailability} from './commands.js';

export function buildHelpLines(context = {}) {
  const translate = context.modeStates?.translate ?? {};
  const chat = context.modeStates?.chat ?? {};
  const forms = context.modeStates?.forms ?? {};
  const capabilityCatalog = context.runtime?.capabilityCatalog;
  const sourceQuestions = capabilityCatalog?.chat?.({language: chat.from})?.questions?.analyze;
  const targetQuestions = capabilityCatalog?.chat?.({language: chat.to})?.questions?.realize;
  const hasSharedYesNo = sourceQuestions?.constructions?.includes('question.yes-no') === true &&
    targetQuestions?.constructions?.includes('question.yes-no') === true;
  const questionScope = hasSharedYesNo ?
    `Chat ${chat.from ?? '?'}→${chat.to ?? '?'}: question.yes-no, pytania tak/nie o widzeniu w czasie teraźniejszym.` :
    `Chat ${chat.from ?? '?'}→${chat.to ?? '?'}: brak wspólnej deklaracji question.yes-no.`;
  const commandLines = COMMAND_DEFINITIONS.map(command => {
    const state = commandAvailability(command, context);
    return {text: `${command.syntax} · ${command.description}${state.available ? '' : ` · ${state.message}`}`,
      tone: state.available ? 'neutral' : 'muted'};
  });
  return [
    {text: 'flexLingua · pomoc', tone: 'accent'},
    {text: `Tryb ${context.activeMode ?? 'translate'} · local · stan i historia istnieją tylko do zamknięcia procesu.`, tone: 'muted'},
    {text: `Translate: ${translate.from ?? '?'}→${translate.to ?? '?'} · Chat: ${chat.from ?? '?'}→${chat.to ?? '?'} · Forms: ${forms.language ?? '?'}.`, tone: 'muted'},
    {text: 'Skróty: F1 Translate · F2 Chat · F3 Forms · Tab/Shift+Tab fokus · Ctrl+P polecenia · Ctrl+C wyjście.', tone: 'neutral'},
    {text: 'W palecie: ↑/↓ wybór · Tab uzupełnij · Enter wykonaj · Esc zamknij; dopiero Enter wysyła treść.', tone: 'neutral'},
    {text: 'Zakres jest ograniczony do zadeklarowanych reguł i providerów. ' + questionScope +
      ' Odpowiedź wymaga faktu sesji i rozstrzygniętych referentów.', tone: 'warning'},
    {text: 'Chat: /chat en pl → A girl sees a dog. → Does a girl see a dog? „Tłumaczenie wypowiedzi” przekłada tekst użytkownika; „Odpowiedź Engine” pochodzi z planera.', tone: 'neutral'},
    {text: 'Bez dopasowanego faktu lub przy nierozstrzygniętej tożsamości wynik może pozostać unknown. /new resetuje sesję po potwierdzeniu; /details pokazuje plan i dowody.', tone: 'muted'},
    {text: 'Przykład EN→PL: “The girl sees the dog.” → “Dziewczynka widzi psa.”', tone: 'accent'},
    {text: 'MeaningGraph: event.visual_perception; agent person.girl; theme animal.dog; present, positive; definiteness jest jawnie raportowane jako utracone.', tone: 'muted'},
    {text: 'Polecenia', tone: 'accent'},
    ...commandLines
  ];
}
