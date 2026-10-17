export const TABS = Object.freeze([
  Object.freeze({id: 'translate', label: 'Translate', key: 'F1'}),
  Object.freeze({id: 'chat', label: 'Chat', key: 'F2'}),
  Object.freeze({id: 'forms', label: 'Forms', key: 'F3'})
]);

const TAB_INDEX = new Map(TABS.map((tab, index) => [tab.key, index]));

export function actionForKey(name) {
  if (TAB_INDEX.has(name)) return {type: 'select_tab', index: TAB_INDEX.get(name)};
  if (name === 'TAB') return {type: 'focus_next'};
  if (name === 'SHIFT_TAB') return {type: 'focus_previous'};
  if (name === 'ENTER' || name === 'KP_ENTER') return {type: 'submit'};
  if (name === 'ESCAPE') return {type: 'escape'};
  if (name === 'CTRL_N') return {type: 'new_session'};
  if (name === 'CTRL_C') return {type: 'quit'};
  if (name === 'PAGE_UP') return {type: 'history_page_up'};
  if (name === 'PAGE_DOWN') return {type: 'history_page_down'};
  if (name === 'CTRL_END') return {type: 'history_latest'};
  if (name === 'BACKSPACE') return {type: 'backspace'};
  if (name === 'DELETE') return {type: 'delete'};
  if (name === 'LEFT') return {type: 'cursor_left'};
  if (name === 'RIGHT') return {type: 'cursor_right'};
  if (name === 'HOME') return {type: 'cursor_home'};
  if (name === 'END') return {type: 'cursor_end'};
  return {type: 'text', value: printableText(name)};
}

function printableText(name) {
  if (typeof name !== 'string' || !name || name.length > 2) return '';
  return Array.from(name).every(char => {
    const code = char.codePointAt(0);
    return code >= 0x20 && code !== 0x7f && !(code >= 0x80 && code <= 0x9f);
  }) ? name : '';
}
