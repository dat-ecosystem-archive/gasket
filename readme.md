```
{
  "gasket": {
    "main": [
      "wget -N http://data.openoakland.org/sites/default/files/Oakland_Parcels_06-01-13.zip",
      "unzip -o Oakland_Parcels_06-01-13.zip",
      {command: "gasket combine"}
    ],
    "combine": [
      "csv-join http://data.openoakland.org/sites/default/files/ParcelUseCodes2013_0.csv 'Use Code' Oakland_Parcels_06-01-13.csv 'Use code'",
      "bcsv",
      "trim-object-stream",
      "dat import --json --primary \"Assessor's Parcel Number (APN) sort format\""
    ]
  }
}
```

```
npm i
gasket
gasket --config gasket.json
gasket fetch combine
```

* run when files change (file watcher)
* run on timer (watch)
* retry/crash/restart semantics
