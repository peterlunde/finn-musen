# Finn musen: oppsett

Du trenger en Google-konto og en gratis konto hos Netlify (eller en annen vert for statiske sider). Regn med 15–20 minutter første gang.

Svarene lagres i et Google Regneark som du eier. Du kan åpne det når som helst og se alle svar, uansett om admin-siden fungerer.

## 1. Regnearket og koden

1. Gå til https://sheets.new og gi regnearket et navn, for eksempel «Finn musen: svar».
2. Velg **Utvidelser → Apps Script** (engelsk: Extensions → Apps Script).
3. Slett all kode som står der, og lim inn hele innholdet i `apps-script/Code.gs`.
4. Øverst i koden står `const ADMIN_PASSWORD = 'ENDRE-MEG';`. Bytt ut teksten med et passord du velger. Admin fungerer ikke før dette er gjort.
5. Trykk **Lagre** (diskettikonet eller Cmd+S).
6. I nedtrekksmenyen over koden velger du funksjonen **oppsett** og trykker **Kjør**. Google ber om tillatelse:
   - Velg kontoen din.
   - Du får en advarsel om at appen ikke er verifisert. Det er normalt for egne skript. Velg **Avansert → Gå til … (usikker)** og godta.
   - Når det er ferdig, finnes fanen «Svar» i regnearket.

## 2. Publiser koden som nettapp

1. Øverst til høyre: **Distribuer → Ny distribusjon** (engelsk: Deploy → New deployment).
2. Trykk tannhjulet ved «Velg type» og velg **Nettapp**.
3. Sett **Kjør som: Meg** og **Hvem har tilgang: Alle**. Det må være «Alle», ikke «Alle med Google-konto», ellers får ikke gjestene lagret svar.
4. Trykk **Distribuer** og kopier **nettapp-URL-en**. Den slutter på `/exec`.
5. Åpne URL-en i en ny fane. Du skal se `{"ok":true,"open":true}`. Da fungerer koden.

> Endrer du Code.gs senere, må du velge **Distribuer → Administrer distribusjoner → blyanten → Versjon: Ny versjon → Distribuer**. Ellers kjører den gamle koden fortsatt. URL-en forblir den samme.

## 3. Koble siden til regnearket

Åpne `site/config.js` i et tekstprogram og lim inn URL-en:

```js
window.APP_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/XXXXXXXX/exec'
};
```

## 4. Legg siden ut på nett

Enklest er Netlify:

1. Gå til https://app.netlify.com/drop og logg inn (eller lag konto).
2. Dra hele mappen **`site`** inn i feltet. Du får en adresse med en gjenkjennelig men lang tilfeldig del.
3. Under **Site configuration → Change site name** kan du velge noe kort, for eksempel `finn-musen-oslo`, som gir `finn-musen-oslo.netlify.app`.

Cloudflare Pages, Vercel og GitHub Pages fungerer også. Det er bare mappen `site` som skal ut.

Hvis du endrer noe i `site`, drar du mappen inn på nytt (Deploys → dra mappen) for å oppdatere.

## 5. Test før onsdag (viktig)

Gjør dette på en ekte telefon, helst på mobildata og ikke bare wifi:

1. Åpne adressen og send inn et svar med et nummer du har.
2. Sjekk at raden dukker opp i fanen «Svar» i regnearket. Hvis siden sier «Fikk ikke kontakt med serveren» selv om `/exec`-adressen viste `{"ok":true…}`, gi beskjed, så bygger vi om slik at alt serveres fra Apps Script.
3. Åpne `adresse/admin.html`, logg inn med passordet ditt og sjekk at du ser svaret.
4. Prøv å sende inn igjen med samme nummer. Du skal få beskjed om at nummeret allerede er brukt.
5. Når du er ferdig med testing, gå til Apps Script, velg funksjonen **nullstillTestdata** og trykk **Kjør**. Det sletter alle svar og trukne vinnere, og åpner innsendingen igjen. Fasiten beholdes.

## 6. På kvelden

1. **Fasit:** åpne admin → Fasit. Trykk på kartet der verket henger, velg format og plassering, og trykk der musen er på verket. Juster toleransen om du vil, og lagre.
   - Toleransen er hvor langt unna en gjest kan trykke og fortsatt få riktig. 15 % er et greit utgangspunkt. Etter lagring ser du hvor mange svar som stemmer, så du kan justere.
2. **Svar:** listen viser «Riktig» eller «Feil» ut fra fasiten. «Godkjenn alle som stemmer med fasit» godkjenner de ventende treffene i ett trykk. Trykk på et svar for å se markeringene og godkjenne eller avvise manuelt.
3. **Steng innsending** når du vil stoppe nye svar.
4. **Trekning:** bare godkjente svar er med. «Trekk ny vinner» tar aldri samme person to ganger.
5. Lag en QR-kode av nettadressen (en vanlig QR-generator holder) og heng den opp i lokalet.

## Personvern

Navn og mobilnummer ligger i regnearket ditt, og bare du og de du deler det med kan se det. Teksten på siste steg sier at opplysningene brukes til trekningen og ikke til markedsføring. Pass på at det stemmer, og slett regnearket (eller radene) når trekningen er ferdig.

## Endre utseende og tekst

- **Tekster:** står i `site/index.html` (deltakersiden).
- **Farger og avstander:** øverst i `site/styles.css`. Svart er knapper og valgt tilstand, oransje (`--accent`) er markørene på kart og verk.
- **Kartet:** `site/map.svg`. Behold navnet, og behold `viewBox` hvis du bytter det.

## Hva som er hva

```
site/
  index.html, app.js      deltakersiden
  admin.html, admin.js    admin (passord, svar, fasit, trekning)
  picker.js               kart og verk (zoom, trykk, markør)
  common.js, styles.css   felles
  config.js               her limer du inn API_URL
  map.svg                 kartet
apps-script/
  Code.gs                 lagring, duplikatsjekk, fasit, trekning
```

Fasiten og passordet ligger bare i Apps Script og sendes aldri til deltakernes nettleser.
