# SQL functions

One file per live SQL function (mostly `SECURITY DEFINER` helpers that let
the app read and write tenant data under FORCE RLS; see
`docs/adr/0001-tenant-data-access.md`). Each file holds the current definition
plus its ownership / grant statements.

To change a function:

1. Edit `db/functions/<name>.sql`.
2. `npm run db:functions:migrate -- short_description` writes a new drizzle
   migration with every changed function.
3. `npm run db:functions:sync` re-stamps the file headers.

`tests/unit/dbFunctions.test.ts` fails when these files and the migrations
disagree. New functions: add the file, then step 2.
