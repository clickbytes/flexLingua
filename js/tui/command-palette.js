import {COMMAND_DEFINITIONS, commandAvailability} from './commands.js';
import {fitText} from './screen.js';

export function commandSuggestions(buffer, context = {}) {
  const source = String(buffer ?? '').trimStart();
  if (!source.startsWith('/') || source.startsWith('//')) return [];
  const firstToken = source.slice(1).split(/\s/u, 1)[0].toLowerCase();
  return COMMAND_DEFINITIONS.filter(command => !firstToken || command.name.startsWith(firstToken));
}

export function completeCommand(buffer, command) {
  const value = String(buffer ?? '');
  const leading = value.match(/^\s*/u)?.[0] ?? '';
  const body = value.slice(leading.length);
  if (!body.startsWith('/') || body.startsWith('//')) return `${leading}/${command.name} `;
  const tail = body.slice(1);
  const whitespace = tail.search(/\s/u);
  if (whitespace < 0) return `${leading}/${command.name} `;
  return `${leading}/${command.name}${tail.slice(whitespace)}`;
}

export function renderCommandPalette({buffer, selectedIndex = 0, width = 80, height = 10,
  context = {}, prefix = '› '} = {}) {
  const suggestions = commandSuggestions(buffer, context);
  if (!suggestions.length) return [{text: `Brak polecenia pasującego do ${buffer}.`, tone: 'warning'}];
  const selected = Math.max(0, Math.min(selectedIndex, suggestions.length - 1));
  const listHeight = Math.max(1, Math.floor(height) - 3);
  let first = Math.max(0, Math.min(selected - Math.floor(listHeight / 2), suggestions.length - listHeight));
  if (selected < first) first = selected;
  if (selected >= first + listHeight) first = selected - listHeight + 1;
  const visible = suggestions.slice(first, first + listHeight);
  const lines = [{text: fitText(`Polecenia ${first + 1}–${first + visible.length}/${suggestions.length} · ↑↓ wybór · Tab uzupełnij`, width),
    tone: 'muted'}];
  for (const command of visible) {
    const active = command === suggestions[selected];
    const available = commandAvailability(command, context).available;
    lines.push({text: fitText(`${active ? prefix : '  '}${command.syntax}${available ? '' : ' · niedostępne'}`, width),
      tone: active ? 'accent' : available ? 'neutral' : 'muted'});
  }
  const status = commandAvailability(suggestions[selected], context);
  lines.push({text: fitText(suggestions[selected].description, width), tone: 'neutral'});
  if (!status.available) lines.push({text: fitText(status.message, width), tone: 'warning'});
  return lines.slice(-Math.max(1, height));
}
