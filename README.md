# snublejuice

> [!WARNING]  
> Utdatert. Flyttet til [snubleJS](https://github.com/hallvardnmbu/snubleJS).

Original kildekode til [snublejuice](https://snublejuice.no) – en applikasjon for å utforske og sammenlikne [vinmonopolets](https://www.vinmonopolet.no) utvalg og prisendringer.

## Informasjon

Applikasjonen bruker [Writer Framework](https://dev.writer.com/framework/introduction)
(tidligere [StreamSync](https://pypi.org/project/streamsync/)).

<details>
  <summary>Kjør applikasjonen lokalt</summary>

  For å kunne kjøre applikasjonen lokalt må (Python eksistere, og) de nødvendige pakkene
  installeres. Dette gjøres ved;

```bash
pip install -r requirements.txt
```

  i terminalen, for så å åpne applikasjonen med

```bash
writer run .
```

  (også fra terminalen).

  OBS: For å kunne kjøres lokalt må enkelte miljøvariabler settes. Dette gjøres ved å kjøre;

```bash
export MONGO_USR=<username>
export MONGO_PWD=<password>
```

  (eller tilsvarende for ditt operativsystem). Hvor `<username>` og `<password>` er brukernavn og passord til din [MongoDB](https://www.mongodb.com)-database (hvilket kan opprettes gratis).

  Første gang applikasjonen kjøres lokalt må databasen initialiseres. Dette gjøres ved å kjøre
  funksjonene i `./scrape/` (etter å ha oppretted databasen `vinskraper` og collection `varer`).

</details>
