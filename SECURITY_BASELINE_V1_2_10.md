# SIDOKTER Security Baseline V1.2.10

- Storage `globalAccess` is never an end-user-readable permission flag. Legacy `globalAccess` metadata is ignored during download authorization.
- ADMIN Root and STRUKTURAL are actor privileges; they do not make uploaded files public to ordinary users.
- Storage authorization uses authenticated actor privilege, file owner, and server-derived access keys.
- Client-supplied `X-Soegiri-Auth-Uid` is not required for storage authorization; the server trusts the validated session only.
- Production release packages must not contain `test-login.json` or credential fixtures.
