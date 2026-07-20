# Back-upinfrastructuur

Productieproject: `recepten-app-87beb`. Geïsoleerd archiefproject:
`recepten-bkp-1021220092410`.

## Actieve lagen

- Firestore `(default)` in `nam5`: delete protection en zeven dagen PITR.
- Dagelijkse Firestore managed backup: 14 weken retentie.
- Private US-multiregionbucket `recepten-archive-1021220092410`:
  uniforme buckettoegang, public-access-prevention, vergrendelde 98-dagenretentie
  en lifecycle-delete vanaf dag 99.
- Cloud Run jobs:
  - `recepten-daily-export`, dagelijks 03:30 Europe/Amsterdam;
  - `recepten-backup-verify`, dagelijks 05:30 Europe/Amsterdam;
  - `recepten-expired-cleanup`, zondag 06:00 Europe/Amsterdam.
- Serviceaccount `recepten-backup-job` heeft in productie uitsluitend Firestore
  import/exportrechten plus self-signing voor kortlevende Firebase custom tokens.
  Op de archiefbucket mag het alleen objectmetadata oplijsten. Er bestaan geen
  service-accountkeys.
- Cloud Monitoring-policy “Recepten backup failure or stale archive” gebruikt
  een e-mailkanaal en het filter uit `backup-alert-policy.json`.
- Het bestaande projectbudget is €5 per maand, met waarschuwingen op 50%, 90%
  en 100%; budgetten schakelen niets automatisch uit.

## Bronbestanden

- `backup-job/`: export, verificatie, status en 98-dagenopschoning.
- `archive-lifecycle.json`: verwijdering vanaf dag 99.
- `backup-alert-log-metric.json`: telmetric voor foutlogs.
- `backup-alert-policy.json`: reproduceerbare alertconditie; het projectgebonden
  notification-channel-ID wordt bij provisioning toegevoegd.

Geheimen, toegangstokens en e-mailadressen horen niet in deze map.
