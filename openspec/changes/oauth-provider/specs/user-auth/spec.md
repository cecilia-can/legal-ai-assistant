## ADDED Requirements

### Requirement: OAuth provider login

The system MUST support GitHub and Google OAuth login when the corresponding provider credentials are configured, while preserving email-password login.

#### Scenario: Configured provider login

- **WHEN** an unauthenticated user selects a configured provider and completes authorization
- **THEN** Auth.js creates or reuses the provider account, establishes a JWT session, and redirects to the chat page

#### Scenario: Provider is not configured

- **WHEN** a user selects a provider whose credentials are missing
- **THEN** the system MUST show a configuration error and MUST NOT expose secrets or break email-password login

### Requirement: Safe account association

The system MUST NOT silently merge an OAuth identity into an existing Credentials account based only on a matching email address.

#### Scenario: Existing email conflict

- **WHEN** an OAuth provider returns an email already owned by a Credentials account without an existing Account binding
- **THEN** the system MUST NOT create a second user, MUST NOT establish a session for the unlinked OAuth identity, and MUST redirect the user to an explicit account-linking flow

### Requirement: Guided OAuth account linking

When an OAuth email conflicts with an existing Credentials account, the system MUST provide a guided linking flow that verifies control of the existing account before creating the Account binding.

#### Scenario: Show linking guidance after an email conflict

- **WHEN** the OAuth callback identifies an existing Credentials account with the same email and no matching Account binding
- **THEN** the system MUST show a clear message that the email is already registered and MUST offer the user a path to link GitHub or Google to that existing account
- **AND** the existing email-password login MUST remain available

#### Scenario: Verify the existing account before linking

- **WHEN** the user starts the linking flow
- **THEN** the system MUST require proof of control of the existing account, such as re-authentication with the existing password or confirmation from an already authenticated session
- **AND** the client MUST NOT be allowed to choose or override the target `userId`, provider, or `providerAccountId`

#### Scenario: Complete a verified account link

- **WHEN** the user successfully verifies the existing account and confirms the link
- **THEN** the system MUST atomically create the OAuth `Account` binding for the verified user, establish the normal JWT session, and redirect the user to the chat page
- **AND** subsequent logins with the same provider account MUST reuse the linked user

#### Scenario: Reject an invalid or expired linking attempt

- **WHEN** the user fails verification, cancels the flow, the linking intent expires, or the provider account is already linked to another user
- **THEN** the system MUST NOT create or modify an Account binding
- **AND** the system MUST show an actionable error while preserving the existing email-password login path

#### Scenario: Protect the pending linking intent

- **WHEN** the system carries OAuth identity data from the callback to the linking page
- **THEN** it MUST use a short-lived, single-use, server-controlled linking intent
- **AND** the linking intent MUST be bound to the OAuth transaction and MUST NOT trust a client-supplied `userId` or provider identity

### Requirement: User isolation after OAuth login

The system MUST apply the same `session.user.id` ownership checks to OAuth-created users as to Credentials users.

#### Scenario: OAuth user accesses conversations

- **WHEN** an OAuth-authenticated user lists or creates conversations
- **THEN** only that user's conversations are returned and new conversations are bound to that user's ID
