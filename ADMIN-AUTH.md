# Admin accounts and customer provisioning

Working checklist. Ticked as each piece lands; this file is the record of what
was decided and why, once it is done.

## What is being built

Customers cannot create their own accounts. One admin, seeded, creates them
through a page in the app instead of through an interactive CLI prompt.

```
/login         customer sign-in   → the console
/admin/login   admin sign-in      → customer management
```

## The decision that shapes everything else

**Admins live in their own table, not as a role on `users`.**

`users.workspace_id` is `NOT NULL` — every user belongs to a workspace. An
admin belongs to none; they sit above them. That could be solved with a
nullable column and a role check, but an admin can create workspaces and write
raw Perfox API keys, which is a different privilege class rather than a
different row in the same one.

Separate tables make the dangerous directions structurally impossible instead
of a check somebody has to remember:

- an admin session cannot reach `/api/perfox/*` — there is no workspace to
  resolve, so it fails by construction rather than by guard
- a customer row cannot be escalated to admin by flipping a column
- the columns that mean nothing for an admin (`workspace_id`, `mobile`,
  `role`) simply are not there

Separate cookie names for the same reason, and one practical one: with a single
name, signing into one surface silently signs you out of the other in the same
browser.

**Credentials are write-only.** No admin endpoint ever returns a Perfox key or
site secret — not even to the admin who typed it. The list shows a flag and a
hint (`sk_…f457`). An endpoint that can read back every tenant's key is one bug
away from being the worst in the system; changing a key means retyping it.

## Checklist

### Backend

- [x] 1. Schema: `admins` and `admin_sessions`
- [x] 2. Admin auth — `/api/admin/login`, `/logout`, `/me`, separate cookie
- [x] 3. Customer management — list, create, suspend; credentials write-only
- [x] 4. `npm run seed:admin` creates the one admin
- [x] 5. Backend tests

### Frontend

- [ ] 6. `/login` — split panel, branding left, form right
- [ ] 7. `/admin/login`
- [ ] 8. Admin shell: customers list + create
- [ ] 9. Remove the Register page and route

### Verification

- [ ] 10. Browser tests updated
- [ ] 11. The existing customer flow is unaffected — all 76 existing tests green

## Deliberately not in scope

| | |
|---|---|
| Editing a customer's credentials | Create and suspend first; edit after |
| Password reset for the admin | Lose it and reseed. Worth knowing, not urgent |
| Rate limiting on either login | argon2 is slow enough to make brute force expensive. `/admin/login` is the higher-value target and should get it next |
| Invitations and magic links | Deferred earlier, still deferred |

More than one admin is allowed by the schema even though only one is seeded.
It costs nothing now, and a single shared admin login is how credentials end up
being passed around in chat later.
