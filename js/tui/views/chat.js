export function createChatView() {
  const state = {draft: '', cursor: 0, focusIndex: 0, status: ''};
  return {
    id: 'chat',
    label: 'Chat',
    state,
    fieldLabel: 'Message',
    actionLabel: 'Send',
    render() {
      return {panels: [
        {title: 'Conversation', kind: 'input', lines: [{text: 'No messages yet.', tone: 'muted'}]}
      ]};
    }
  };
}
