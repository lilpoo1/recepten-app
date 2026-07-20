# Calamiteitenprocedure ReceptenApp

Deze procedure voorkomt dat herstelhandelingen de productiedatabase verder beschadigen.
Een volledige import gaat **nooit** rechtstreeks naar `(default)`.

## Herstelgaranties

| Probleem | Eerste herstelbron | Bewaartermijn |
| --- | --- | --- |
| Eén verwijderd of gewijzigd recept | Prullenbak / versiegeschiedenis | 98 dagen |
| Massale fout of corruptie, maximaal 7 dagen oud | Firestore PITR | 7 dagen |
| Oudere fout | Dagelijkse managed backup | 14 weken |
| Verlies of onbereikbaarheid productieproject | Geïsoleerde dagelijkse export | 98 dagen |
| Tijdelijk offline | Drie IndexedDB-snapshots op het toestel | Best effort |

Doel: maximaal 24 uur dataverlies bij volledig projectverlies en herstel binnen
vier uur. Het archiefproject en de productieruntime delen geen lees- of
verwijderrechten. De archiefbucket heeft public-access-prevention, uniforme
toegang en een onomkeerbaar vergrendelde retentie van 98 dagen.

## Eén recept

1. Open **Recepten → Prullenbak** en herstel een soft-deleted recept.
2. Voor een foutieve wijziging: open het recept, kies **Versies**, vergelijk datum
   en versie en herstel de juiste revision.
3. Controleer recepttekst, ingrediënten en afbeelding.

## Massale corruptie of foutieve release

1. Stop nieuwe deployments en noteer het vermoedelijke tijdstip.
2. Controleer `system/backupStatus` en de Cloud Monitoring-melding.
3. Kies PITR (binnen zeven dagen) of een managed backup.
4. Herstel naar een nieuwe database met naam `recovery-*`, nooit naar `(default)`.
5. Valideer aantallen, leden, afbeeldingen en SHA-256-hashes:

   ```powershell
   .\scripts\firestore-recovery.ps1 -Mode restore `
     -SourceUri "<export-uri>" -RecoveryDatabase "recovery-YYYYMMDD"
   .\scripts\firestore-recovery.ps1 -Mode validate `
     -SourceUri "<export-uri>" -RecoveryDatabase "recovery-YYYYMMDD"
   ```

6. Doe eerst een dry-run voor expliciete documentpaden:

   ```powershell
   node scripts/restore-selected-documents.mjs `
     --source=recovery-YYYYMMDD `
     --paths=households/HOUSEHOLD/recipes/RECIPE
   ```

7. Herhaal alleen na inhoudelijke controle met `--apply=true
   --confirm=RESTORE_SELECTED_TO_PRODUCTION`. Controleer daarna de live app.

## Volledig database- of projectverlies

1. Gebruik de nieuwste volledige export uit project
   `recepten-bkp-1021220092410`, bucket
   `recepten-archive-1021220092410`.
2. Maak een vervangende Firestore-database in `nam5`.
3. Importeer de export in die tijdelijke database.
4. Voer `scripts/verify-firestore-restore.mjs` uit en eis nul verschillen voor
   documenten en afbeeldingshashes.
5. Zet uitsluitend gecontroleerde documenten terug. Bewaar de oorspronkelijke
   omgeving read-only totdat de nacontrole klaar is.

## Verloren accounttoegang

De eigenaar meldt zich eerst opnieuw aan met Google en kopieert uitsluitend de
nieuwe Firebase UID. Na controle van huishouden en UID:

```powershell
node scripts/reassign-household-owner.mjs `
  --household=HOUSEHOLD_ID --new-uid=NIEUWE_FIREBASE_UID
```

Herhaal alleen na expliciete bevestiging met `--apply=true` en de in de dry-run
genoemde bevestigingstekst. Het script slaat geen e-mailadres, naam of foto op en
laat de oude UID staan voor forensisch herstel.

## Veilige release

Gebruik `npm run deploy:safe`. Deze poort stopt bij falende unit-tests,
Firestore-rulestests, lint, build of een geïsoleerde back-up ouder dan 25 uur.
Datamigraties zijn additief en versieerbaar; voor massale wijzigingen is eerst
een export plus dry-run verplicht.

## Periodieke controle

- Dagelijks: export, verifier en back-upstatus automatisch.
- Wekelijks: opschoning van recepten die minstens 98 dagen soft-deleted zijn,
  uitsluitend wanneer een recente export is geverifieerd.
- Per kwartaal: herstel een export of managed backup naar een tijdelijke
  database, vergelijk hashes en verwijder het tijdelijke doel na vastlegging.
- Beheeraccount: MFA of passkey verplicht; geen service-accountkeys aanmaken.
