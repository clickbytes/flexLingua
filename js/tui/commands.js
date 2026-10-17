const CHAT_MODES = Object.freeze(['translate', 'chat', 'forms']);

function defineCommand({name, syntax, argumentNames = [], argumentCounts = [argumentNames.length],
  description, modes = CHAT_MODES, validate = () => null, available, run}) {
  const names = Object.freeze([...argumentNames]);
  const allowedCounts = Object.freeze([...argumentCounts]);
  const allowedModes = Object.freeze([...modes]);
  return Object.freeze({
    id: name,
    name,
    syntax,
    argumentNames: names,
    argumentCounts: allowedCounts,
    description,
    modes: allowedModes,
    validate(args, context) {
      if (!allowedCounts.includes(args.length)) {
        return `Składnia: ${syntax}`;
      }
      return validate(args, context);
    },
    available,
    run
  });
}

function knownLanguages(context) {
  return new Set(context.runtime?.capabilityCatalog?.listLanguages?.()
    .map(item => item.code.toLowerCase()) ?? []);
}

function validateLanguages(args, context) {
  const known = knownLanguages(context);
  const code = args.find(item => !known.has(item.toLowerCase()));
  return code ? `Nieznany kod języka: ${code}.` : null;
}

function unavailable(message) {
  return () => ({available: false, message});
}

function selectedEntry(context, requestedId) {
  const entries = context.modeStates?.[context.activeMode]?.entries ?? [];
  if (requestedId === undefined) return entries.at(-1) ?? null;
  return entries.find(entry => entry.id === requestedId || entry.id === `op-${requestedId}`) ?? null;
}

function validateDetails(args, context) {
  return selectedEntry(context, args[0]) ? null : args.length ?
    `Nie znaleziono wpisu ${args[0]} w trybie ${context.activeMode}.` :
    'Brak wpisu do pokazania w Details.';
}

const SETTINGS_UNAVAILABLE = 'Panel Settings będzie dostępny po UX-11.';
const DETAILS_UNAVAILABLE = 'Panel Details będzie dostępny po UX-08.';

export const COMMAND_DEFINITIONS = Object.freeze([
  defineCommand({name: 'translate', syntax: '/translate [from to]',
    argumentNames: ['from', 'to'], argumentCounts: [0, 2],
    description: 'Przejdź do Translate; opcjonalnie ustaw kierunek.',
    validate: validateLanguages,
    run: args => ({type: 'switch_mode', mode: 'translate',
      ...(args.length ? {from: args[0].toLowerCase(), to: args[1].toLowerCase()} : {})})}),
  defineCommand({name: 'chat', syntax: '/chat [from to]',
    argumentNames: ['from', 'to'], argumentCounts: [0, 2],
    description: 'Przejdź do lokalnej sesji Chat; opcjonalnie ustaw kierunek.',
    validate: validateLanguages,
    run: args => ({type: 'switch_mode', mode: 'chat',
      ...(args.length ? {from: args[0].toLowerCase(), to: args[1].toLowerCase()} : {})})}),
  defineCommand({name: 'forms', syntax: '/forms [lang]',
    argumentNames: ['lang'], argumentCounts: [0, 1],
    description: 'Przejdź do Forms; opcjonalnie ustaw język wyszukiwania.',
    validate: validateLanguages,
    run: args => ({type: 'switch_mode', mode: 'forms',
      ...(args.length ? {language: args[0].toLowerCase()} : {})})}),
  defineCommand({name: 'settings', syntax: '/settings',
    description: 'Ustawienia tylko do zamknięcia aplikacji.',
    available: unavailable(SETTINGS_UNAVAILABLE),
    run: () => ({type: 'unavailable', message: SETTINGS_UNAVAILABLE})}),
  defineCommand({name: 'help', syntax: '/help', description: 'Polecenia, skróty i ograniczenia Engine.',
    run: () => ({type: 'open_panel', panel: 'help'})}),
  defineCommand({name: 'details', syntax: '/details [id]',
    argumentNames: ['id'], argumentCounts: [0, 1],
    description: 'Szczegóły istniejącego wpisu bieżącego trybu.',
    validate: validateDetails,
    available: unavailable(DETAILS_UNAVAILABLE),
    run: () => ({type: 'unavailable', message: DETAILS_UNAVAILABLE})}),
  defineCommand({name: 'swap', syntax: '/swap', description: 'Odwróć dostępny kierunek Translate.',
    modes: ['translate'],
    available: context => {
      const state = context.modeStates?.translate;
      if (!state?.from || !state?.to) return {available: false, message: 'Brak kierunku do odwrócenia.'};
      const reverse = context.runtime?.capabilityCatalog?.translation?.({from: state.to, to: state.from});
      return reverse?.status === 'available' ? {available: true} :
        {available: false, message: `Kierunek ${state.to}→${state.from} nie jest zadeklarowany.`};
    },
    run: () => ({type: 'swap_direction'})}),
  defineCommand({name: 'clear', syntax: '/clear',
    description: 'Po potwierdzeniu wyczyść historię prezentacji tego trybu.',
    run: (_args, context) => ({type: 'confirm_clear', mode: context.activeMode})}),
  defineCommand({name: 'new', syntax: '/new',
    description: 'Po potwierdzeniu zresetuj lokalną sesję Chat.', modes: ['chat'],
    run: () => ({type: 'new_session'})}),
  defineCommand({name: 'quit', syntax: '/quit', description: 'Zakończ i przywróć terminal.',
    run: () => ({type: 'quit'})})
]);

const COMMANDS_BY_NAME = new Map(COMMAND_DEFINITIONS.map(command => [command.name, command]));

export function commandAvailability(command, context = {}) {
  if (!command.modes.includes(context.activeMode)) {
    const label = command.modes.map(mode => mode[0].toUpperCase() + mode.slice(1)).join(', ');
    return {available: false, message: `Dostępne w trybie: ${label}.`};
  }
  const result = command.available?.(context) ?? {available: true};
  return typeof result === 'boolean' ? {available: result} : result;
}

function commandError(message, command = null) {
  return {kind: 'error', command, message};
}

/** Parse only the beginning of the submitted text; command names must match in full. */
export function resolveCommand(value, context = {}) {
  const input = String(value ?? '');
  const leading = input.match(/^\s*/u)?.[0] ?? '';
  const body = input.slice(leading.length);
  if (!body.startsWith('/')) return {kind: 'text', text: input};
  if (body.startsWith('//')) return {kind: 'literal', text: `${leading}${body.slice(1)}`};
  if (/[\r\n]/u.test(body)) return commandError('Polecenie musi znajdować się w jednym wierszu.');

  const tokens = body.slice(1).trim().split(/\s+/u).filter(Boolean);
  if (!tokens.length) return commandError('Wpisz pełną nazwę polecenia.');
  const name = tokens[0].toLowerCase();
  const command = COMMANDS_BY_NAME.get(name);
  if (!command) return commandError(`Nieznane polecenie: /${tokens[0]}. Użyj /help.`, name);
  const args = tokens.slice(1);
  const validationError = command.validate(args, context);
  if (validationError) return commandError(validationError, name);

  const state = commandAvailability(command, context);
  if (!state.available) return commandError(state.message, name);
  return {kind: 'command', command, args, action: command.run(args, context)};
}
