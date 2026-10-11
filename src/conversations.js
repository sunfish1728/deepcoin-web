// 空白草稿不算對話；送出過訊息的失敗或中斷對話仍然保留。
export function savedConversations(conversations) {
  return conversations.filter(c => Array.isArray(c.messages) && c.messages.some(m =>
    ['user', 'assistant'].includes(m.role) && typeof m.content === 'string' && m.content.trim()
  ));
}
