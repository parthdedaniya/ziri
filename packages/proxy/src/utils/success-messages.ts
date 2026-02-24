export const SUCCESS_MESSAGES = {
  API_KEY_CREATED: 'API key created successfully. Save the key - it won\'t be shown again!',
  API_KEY_ROTATED: 'API key rotated successfully. Save the new key - it won\'t be shown again!',
  USER_CREATED_EMAIL_SENT: 'User created successfully. Credentials have been sent to the user\'s email address.',
  USER_CREATED_EMAIL_NOT_SENT: 'User created successfully. Save the password - it won\'t be shown again! Email was not sent (email service not configured or failed).',
  USER_PASSWORD_RESET_EMAIL_SENT: 'Password reset successfully. The new password has been sent to the user\'s email address.',
  USER_PASSWORD_RESET_EMAIL_NOT_SENT: 'Password reset successfully. Save the password - it won\'t be shown again! Email was not sent (email service not configured or failed).',
  DASHBOARD_USER_CREATED_EMAIL_SENT: 'Dashboard user created successfully. Credentials have been sent to the user\'s email address.',
  DASHBOARD_USER_CREATED_EMAIL_NOT_SENT: 'Dashboard user created successfully. Save the password - it won\'t be shown again! Email was not sent (email service not configured or failed).',
  DASH_USER_PW_RESET_SENT: 'Password reset. New password sent to user\'s email.',
  DASH_USER_PW_RESET_NOT_SENT: 'Password reset. Save the password below; email was not sent.',
} as const
