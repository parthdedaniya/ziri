export const USER_MESSAGES: Record<string, string> = {
  'UserKey entity not found for user': 'API key setup is incomplete. Please contact support.',
  'User entity not found': 'User account could not be found.',
}

export function mapToUserMessage(message?: string): string | undefined {
  if (!message) return undefined
  return USER_MESSAGES[message]
}
