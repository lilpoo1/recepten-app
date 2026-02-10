# ReceptenApp

Mobiele Next.js app voor:
- recepten beheren
- weekmenu plannen
- boodschappenlijst genereren
- Bring-import via publieke snapshot links

## Wat is nu toegevoegd

- Data-architectuur met provider + datasource-laag.
- Huishouden-flow:
  - `/household/create`
  - `/household/join`
  - `/household/manage`
- Migratiebanner voor eenmalige import van legacy `localStorage` data.
- Data-integriteit: verwijderen van recept verwijdert gekoppelde planning.
- Unieke IDs i.p.v. `Date.now()` IDs.
- Firebase App Hosting config (`apphosting.yaml`, `firebase.json`).
- Firestore security rules incl. Bring share regels.
- CI workflow (`.github/workflows/ci.yml`) met lint + build.

## Lokale ontwikkeling

```bash
npm run dev
```

Open `http://localhost:3000`.

## Kwaliteitschecks

```bash
npm run lint
npm run build
```

## Firebase modus

De app ondersteunt Firebase Auth + Firestore voor sync en Bring snapshots.

Benodigde env vars:

- `NEXT_PUBLIC_ENABLE_FIREBASE=true`
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

Belangrijk: voor App Hosting moeten deze `NEXT_PUBLIC_*` variabelen beschikbaar zijn op:
- `BUILD`
- `RUNTIME`

## Deploy

```bash
npm run deploy
```

Deploy script:
- `firebase deploy --only apphosting`

Op Windows (PowerShell policy issues):

```bash
firebase.cmd deploy --only apphosting
```

## Datamodel (Firestore)

- `households/{householdId}`
- `households/{householdId}/recipes/{recipeId}`
- `households/{householdId}/mealPlan/{entryId}`
- `households/{householdId}/members/{uid}`
- `householdInvites/{code}`
- `userMemberships/{uid}`
- `bringShares/{token}`

## Bring snapshot links

- Exportpagina genereert een publieke link: `/bring/share/{token}`.
- Elke snapshot is standaard 24 uur geldig.
- Publieke read op `bringShares/{token}` is alleen toegestaan zolang `expiresAt` in de toekomst ligt.

## Migratiegedrag

- Legacy keys: `recipes`, `mealPlan`.
- Bij eerste household-koppeling wordt een eenmalige import aangeboden.
- Status wordt vastgelegd als migration meta per household.
