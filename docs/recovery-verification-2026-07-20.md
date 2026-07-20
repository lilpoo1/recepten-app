# Herstelverificatie 20 juli 2026

Dit verslag legt de eerste volledige acceptatie van de herstelvoorzieningen vast.
Er staan geen e-mailadressen, tokens of Firebase-UID's in dit document.

## Productiebescherming

- Firestore `(default)` staat in `nam5`.
- Database-delete-protection is ingeschakeld.
- Point-in-time recovery is ingeschakeld met zeven dagen historie.
- De dagelijkse managed-backupplanning bewaart herstelpunten 8.467.200 seconden
  (98 dagen / 14 weken).
- De eerste managed backup is `READY`, met snapshotmoment
  `2026-07-20T09:08:12.304312Z` en vervaldatum
  `2026-10-26T09:08:12.304312Z`.

## Geïsoleerd archief

- Project: `recepten-bkp-1021220092410`.
- Bucket: `recepten-archive-1021220092410`, US-multiregion.
- Uniforme buckettoegang en public-access-prevention zijn ingeschakeld.
- De retentie van 98 dagen is onomkeerbaar vergrendeld.
- De lifecycle verwijdert objecten vanaf dag 99.
- De back-uptaak kan alleen objectmetadata oplijsten; de Firestore-serviceagent
  heeft de schrijfrechten die de export vereist.
- Er zijn geen gebruikersbeheerde sleutels voor het back-upserviceaccount.
- De export-, verifier- en opschoontaken hebben alle een succesvolle uitvoering.
  De dagelijkse planners staan aan in tijdzone `Europe/Amsterdam`.

## Echte herstelproeven

| Herstelbron | Resultaat |
| --- | --- |
| Baseline-export vóór hardening | 150/150 documenten, 18/18 receptafbeeldingen en nul hashverschillen na import in een tijdelijke database |
| Managed backup | 151/151 documenten, 32/32 databasebrede receptdocumenten, 18/18 afbeeldingen en nul hashverschillen |
| PITR-kloon | 151/151 documenten, 32/32 databasebrede receptdocumenten, 18/18 afbeeldingen en nul hashverschillen |
| Dagelijks geïsoleerd archief | 151/151 documenten, 32/32 databasebrede receptdocumenten, 18/18 afbeeldingen en nul relevante hashverschillen |

De 32 databasebrede receptdocumenten bestaan uit 31 recepten in het
productiehuishouden van de gebruiker en één recept in een ander bestaand
huishouden. Dit getal is dus niet het aantal dat één gebruiker in de app hoort
te zien.

De dagelijkse archiefexport is op `2026-07-20T17:53:19Z` gestart. Een nieuwe
database `archive-audit-20260720` is om `2026-07-20T19:46:04Z` aangemaakt,
uitsluitend vanuit die export gevuld en met de versiebeheerbare verifier
gecontroleerd. Alleen `system/backupStatus` verschilde, omdat de back-uptaak dit
afgeleide statusdocument rond het exportmoment bijwerkt. Dit pad is expliciet
uitgezonderd en apart gerapporteerd; recepten, leden, planning en afbeeldingen
zijn niet uitgezonderd. De tijdelijke database is na validatie om
`2026-07-20T19:51:43Z` verwijderd. Alleen de delete-protected productiedatabase
bleef daarna over.

De managed-backuprestore begon om `2026-07-20T18:18:41Z`, de PITR-kloon om
`2026-07-20T18:33:55Z` en beide tijdelijke doelen waren na vergelijking vóór
`2026-07-20T18:50:24Z` opgeruimd. Daarmee is restore plus validatie binnen
ongeveer 32 minuten uitgevoerd, ruim binnen het doel van vier uur.

## Monitoring en accounttoegang

- De verifier accepteert geen geïsoleerde export ouder dan 25 uur.
- Een gecontroleerde fout opende een Cloud Monitoring-incident.
- De projecteigenaar bevestigde ontvangst van de bijbehorende e-mailmelding.
- Budgetwaarschuwingen staan op 50%, 90% en 100% van €5 per maand en schakelen
  diensten niet automatisch uit.
- Het bestaande anonieme account is aan Google gekoppeld zonder UID- of
  huishoudwijziging.
- Een login vanuit een privébrowser werkte met dezelfde eigenaar-UID; het
  Firebase-inlogtijdstip veranderde van `2026-07-20T19:25:30.929Z` naar
  `2026-07-20T19:32:19.614Z` en dezelfde 31 recepten waren zichtbaar.
- Firestore bewaart voor deze koppeling alleen UID, huishouden en rol; profiel-
  en e-mailgegevens blijven uitsluitend binnen Firebase Authentication.

## Releasepoorten

Na de laatste verifiercorrectie zijn de volgende controles opnieuw uitgevoerd:

- unit-tests: 10 geslaagd;
- Firestore-rulestests: 12 geslaagd;
- ESLint: geslaagd;
- Next.js-productiebuild: geslaagd;
- live back-upversheid: `healthy`, ongeveer twee uur oud.

De Java 17-waarschuwing van Firebase CLI 14.24.2 is geen testfout. Voor een
toekomstige overstap naar Firebase CLI 15 moet de CI-/beheer-Java-runtime eerst
naar Java 21 of hoger worden bijgewerkt.
