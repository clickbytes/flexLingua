import {COMMAND_DEFINITIONS, commandAvailability} from './commands.js';

function operationStatus(summary) {
  if (!summary) return 'unknown';
  return summary.status ?? (summary.available ? 'available' : 'unsupported');
}

export function buildHelpLines(context = {}) {
  const translate = context.modeStates?.translate ?? {};
  const chat = context.modeStates?.chat ?? {};
  const forms = context.modeStates?.forms ?? {};
  const chatCapabilities = context.runtime?.capabilityCatalog?.chat?.({language: chat.from});
  const questionStatus = operationStatus(chatCapabilities?.questions?.analyze);
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
    {text: 'Zakres jest ograniczony do zadeklarowanych reguł i providerów. Chat odpowiada tylko tam, gdzie pozwala planner; pytania: analyze ' + questionStatus + '.', tone: 'warning'},
    {text: 'Przykład EN→PL: “The girl sees the dog.” → “Dziewczynka widzi psa.”', tone: 'accent'},
    {text: 'MeaningGraph: event.visual_perception; agent person.girl; theme animal.dog; present, positive; definiteness jest jawnie raportowane jako utracone.', tone: 'muted'},
    {text: 'Polecenia', tone: 'accent'},
    ...commandLines
  ];
}
