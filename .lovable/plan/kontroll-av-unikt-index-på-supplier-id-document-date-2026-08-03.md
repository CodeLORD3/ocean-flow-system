# Kontroll av unikt index på (supplier_id, document_date)

## Resultat: ingen krock, inget behöver ändras

Kontrollen mot databasen visar att indexet redan är partiellt och att de 54 befintliga rapporterna faller utanför det.

Indexet som ligger i databasen:

```text
purchase_reports_supplier_docdate_uniq
  UNIQUE (supplier_id, document_date)
  WHERE supplier_id IS NOT NULL
    AND document_date IS NOT NULL
    AND document_number IS NULL
```

Villkoret är alltså till och med snävare än det du beskriver: utöver att båda fälten måste vara ifyllda gäller det bara rader som saknar dokumentnummer, så GFA-fallet täcks utan att krocka med dokument som har nummer (de fångas av `purchase_reports_supplier_docnr_uniq`, som är partiellt på samma sätt).

Befintliga rader:

- 54 rapporter totalt
- 0 med `supplier_id` ifyllt
- 0 med `document_date` ifyllt

Alla 54 ligger därmed utanför indexets `WHERE`-villkor. De behöver ingen backfill, och migrationen är redan genomförd utan konflikt.

## Vad som inte behövs

- Ingen ny migration för att göra indexet partiellt — det är redan det.
- Ingen backfill av `supplier_id` eller `document_date` på de gamla rapporterna.

## Effekt framåt

Dubblettspärren aktiveras först när en rapport både får en leverantörskoppling och ett dokumentdatum från inläsningen. Gamla rapporter utan dessa fält blockerar inte nya inläsningar.
