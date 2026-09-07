# AUDIT — USER DIRECTORY RESTORE

## Finding
The account-management UI was receiving a successful but incomplete `user-list` response from the authentication backend. The response could contain only the Administrator account, and the UI treated that response as authoritative, replacing the complete cached directory.

Firebase/Firestore still contains the full user profile population.

## Fix
- The Administrator account-management directory now reads the Firestore `users` collection first.
- The authentication API remains a fallback only when the Firestore directory is temporarily unavailable.
- A smaller fallback response is never allowed to overwrite a larger known user directory.
- Existing cache is preserved when a suspicious partial response is received.
- No credentials, password hashes, sessions, hierarchy rules, or SK/MOU rules were changed.

## Expected result
The Account Management modal must show the complete Firebase `users` collection (excluding `guest`), including all existing users and their hierarchy/badge profile data.
