// Výchozí seznam lékařů (pozice a obvyklé počty a víkendy/svátky (fair) z rozpisů květen–listopad 2026).
// Upravuje se v aplikaci na kartě Lékaři; tento soubor slouží jen jako výchozí stav.
export const DEFAULT_DOCTORS = [
 {
  "id": "lekar-01",
  "name": "Hruda",
  "active": true,
  "positions": [
   "l1",
   "l2"
  ],
  "max": null,
  "note": "",
  "typical24": 4,
  "fair": {
   "n24": 24,
   "we": 8.5,
   "hol": 1,
   "noWe": 0.0
  }
 },
 {
  "id": "lekar-02",
  "name": "Štětka",
  "active": true,
  "positions": [
   "l1"
  ],
  "max": null,
  "note": "",
  "typical24": 4,
  "fair": {
   "n24": 24,
   "we": 6.5,
   "hol": 0,
   "noWe": 0.0
  }
 },
 {
  "id": "lekar-03",
  "name": "Volčík",
  "active": true,
  "positions": [
   "l1",
   "l2"
  ],
  "max": null,
  "note": "",
  "typical24": 4,
  "fair": {
   "n24": 24,
   "we": 7.0,
   "hol": 3,
   "noWe": 0.5
  }
 },
 {
  "id": "lekar-04",
  "name": "Chobola",
  "active": false,
  "positions": [
   "l1",
   "l2",
   "plast"
  ],
  "max": null,
  "note": "",
  "typical24": 4,
  "fair": {
   "n24": 24,
   "we": 8.5,
   "hol": 0,
   "noWe": 0.0
  }
 },
 {
  "id": "lekar-05",
  "name": "Čundrle",
  "active": true,
  "positions": [
   "l1",
   "l2"
  ],
  "max": null,
  "note": "",
  "typical24": 4,
  "fair": {
   "n24": 24,
   "we": 9.5,
   "hol": 1,
   "noWe": 0.5
  }
 },
 {
  "id": "lekar-06",
  "name": "Jelínek",
  "active": true,
  "positions": [
   "l1",
   "l2",
   "plast"
  ],
  "max": null,
  "note": "",
  "typical24": 4,
  "fair": {
   "n24": 24,
   "we": 6.0,
   "hol": 1,
   "noWe": 1.0
  }
 },
 {
  "id": "lekar-07",
  "name": "Niedobová",
  "active": true,
  "positions": [
   "l1",
   "l2",
   "1A",
   "plast"
  ],
  "max": null,
  "note": "",
  "typical24": 4,
  "fair": {
   "n24": 24,
   "we": 7.5,
   "hol": 0,
   "noWe": 0.0
  }
 },
 {
  "id": "lekar-08",
  "name": "Růžek",
  "active": true,
  "positions": [
   "l1",
   "l2",
   "OUPd",
   "OUPn"
  ],
  "max": null,
  "note": "",
  "typical24": 3.3,
  "fair": {
   "n24": 20,
   "we": 8.0,
   "hol": 2,
   "noWe": 1.0
  }
 },
 {
  "id": "lekar-09",
  "name": "Suk",
  "active": true,
  "positions": [
   "l1",
   "l2"
  ],
  "max": null,
  "note": "",
  "typical24": 4,
  "fair": {
   "n24": 24,
   "we": 8.0,
   "hol": 0,
   "noWe": 0.0
  }
 },
 {
  "id": "lekar-10",
  "name": "Bartošík",
  "active": true,
  "positions": [
   "l1",
   "l2"
  ],
  "max": null,
  "note": "",
  "typical24": 3.2,
  "fair": {
   "n24": 13,
   "we": 5.0,
   "hol": 1,
   "noWe": 1.0
  }
 },
 {
  "id": "lekar-11",
  "name": "Fencl",
  "active": true,
  "positions": [
   "l1",
   "l2"
  ],
  "max": null,
  "note": "",
  "typical24": 3.2,
  "fair": {
   "n24": 19,
   "we": 9.5,
   "hol": 0,
   "noWe": 0.0
  }
 },
 {
  "id": "lekar-12",
  "name": "Kříž",
  "active": true,
  "positions": [
   "l2",
   "plast",
   "OUPd",
   "OUPn"
  ],
  "max": null,
  "note": "",
  "typical24": 3.2,
  "fair": {
   "n24": 19,
   "we": 10.0,
   "hol": 0,
   "noWe": 0.0
  }
 },
 {
  "id": "lekar-13",
  "name": "Pavlunová",
  "active": true,
  "positions": [
   "l2",
   "plast",
   "OUPd",
   "OUPn"
  ],
  "max": null,
  "note": "",
  "typical24": 3,
  "fair": {
   "n24": 6,
   "we": 2.0,
   "hol": 1,
   "noWe": 0.0
  }
 },
 {
  "id": "lekar-14",
  "name": "Pokorný",
  "active": true,
  "positions": [
   "l2",
   "1A",
   "plast",
   "OUPd",
   "OUPn"
  ],
  "max": null,
  "note": "",
  "typical24": 3.7,
  "fair": {
   "n24": 22,
   "we": 6.5,
   "hol": 2,
   "noWe": 2.0
  }
 },
 {
  "id": "lekar-15",
  "name": "Svoboda",
  "active": true,
  "positions": [
   "l2",
   "plast",
   "OUPd",
   "OUPn"
  ],
  "max": null,
  "note": "",
  "typical24": 3.2,
  "fair": {
   "n24": 19,
   "we": 9.5,
   "hol": 1,
   "noWe": 0.0
  }
 },
 {
  "id": "lekar-16",
  "name": "Mazúr",
  "active": true,
  "positions": [
   "l2",
   "1A",
   "plast",
   "OUPd",
   "OUPn"
  ],
  "max": null,
  "note": "",
  "typical24": 3.3,
  "fair": {
   "n24": 20,
   "we": 8.5,
   "hol": 0,
   "noWe": 0.5
  }
 },
 {
  "id": "lekar-17",
  "name": "Predáč",
  "active": true,
  "positions": [
   "l2",
   "1A",
   "plast",
   "OUPd",
   "OUPn"
  ],
  "max": null,
  "note": "",
  "typical24": 3.2,
  "fair": {
   "n24": 19,
   "we": 5.0,
   "hol": 2,
   "noWe": 1.5
  }
 },
 {
  "id": "lekar-18",
  "name": "Zimmer",
  "active": true,
  "positions": [
   "l2",
   "plast",
   "OUPd",
   "OUPn"
  ],
  "max": null,
  "note": "",
  "typical24": 3.3,
  "fair": {
   "n24": 20,
   "we": 7.0,
   "hol": 1,
   "noWe": 0.0
  }
 },
 {
  "id": "lekar-19",
  "name": "Zvoníčková",
  "active": true,
  "positions": [
   "l2",
   "1A"
  ],
  "max": null,
  "note": "",
  "typical24": 4,
  "fair": {
   "n24": 24,
   "we": 6.0,
   "hol": 0,
   "noWe": 0.0
  }
 },
 {
  "id": "lekar-20",
  "name": "Hasara",
  "active": true,
  "positions": [
   "l2",
   "1A",
   "plast"
  ],
  "max": null,
  "note": "",
  "typical24": 3.5,
  "fair": {
   "n24": 21,
   "we": 4.0,
   "hol": 1,
   "noWe": 2.0
  }
 },
 {
  "id": "lekar-21",
  "name": "Helán",
  "active": true,
  "positions": [
   "l2"
  ],
  "max": 1,
  "note": "",
  "typical24": 1.2,
  "fair": {
   "n24": 7,
   "we": 0.5,
   "hol": 0,
   "noWe": 5.5
  }
 },
 {
  "id": "lekar-22",
  "name": "Bartoš",
  "active": true,
  "positions": [
   "1A",
   "plast",
   "OUPd",
   "OUPn"
  ],
  "max": null,
  "note": "",
  "typical24": 2.8,
  "fair": {
   "n24": 17,
   "we": 5.0,
   "hol": 2,
   "noWe": 1.5
  }
 },
 {
  "id": "lekar-23",
  "name": "Fabián",
  "active": true,
  "positions": [
   "1A",
   "plast",
   "OUPd",
   "OUPn"
  ],
  "max": null,
  "note": "",
  "typical24": 2.8,
  "fair": {
   "n24": 17,
   "we": 6.0,
   "hol": 0,
   "noWe": 0.0
  }
 },
 {
  "id": "lekar-24",
  "name": "Fischer",
  "active": true,
  "positions": [
   "1A",
   "plast",
   "OUPd",
   "OUPn"
  ],
  "max": null,
  "note": "",
  "typical24": 3,
  "fair": {
   "n24": 18,
   "we": 9.0,
   "hol": 1,
   "noWe": 0.0
  }
 },
 {
  "id": "lekar-25",
  "name": "Grác",
  "active": true,
  "positions": [
   "1A",
   "plast",
   "OUPd",
   "OUPn"
  ],
  "max": null,
  "note": "",
  "typical24": 2.8,
  "fair": {
   "n24": 17,
   "we": 6.5,
   "hol": 0,
   "noWe": 1.0
  }
 },
 {
  "id": "lekar-26",
  "name": "Mareček",
  "active": true,
  "positions": [
   "1A",
   "plast",
   "OUPd",
   "OUPn"
  ],
  "max": null,
  "note": "",
  "typical24": 3.2,
  "fair": {
   "n24": 19,
   "we": 9.5,
   "hol": 0,
   "noWe": 0.0
  }
 },
 {
  "id": "lekar-27",
  "name": "Křemečková",
  "active": true,
  "positions": [
   "1A",
   "plast",
   "OUPd",
   "OUPn"
  ],
  "max": null,
  "note": "",
  "typical24": 3.3,
  "fair": {
   "n24": 20,
   "we": 7.0,
   "hol": 0,
   "noWe": 0.0
  }
 },
 {
  "id": "lekar-28",
  "name": "Řezníčková",
  "active": true,
  "positions": [
   "1A",
   "plast",
   "OUPd",
   "OUPn"
  ],
  "max": null,
  "note": "",
  "typical24": 2.7,
  "fair": {
   "n24": 16,
   "we": 7.5,
   "hol": 0,
   "noWe": 0.0
  }
 },
 {
  "id": "lekar-29",
  "name": "Valachová",
  "active": true,
  "positions": [
   "1A",
   "plast",
   "OUPd",
   "OUPn"
  ],
  "max": null,
  "note": "",
  "typical24": 2.7,
  "fair": {
   "n24": 16,
   "we": 6.0,
   "hol": 0,
   "noWe": 1.5
  }
 },
 {
  "id": "lekar-30",
  "name": "Schröderová",
  "active": true,
  "positions": [
   "plast"
  ],
  "max": null,
  "note": "",
  "typical24": 3.5,
  "fair": {
   "n24": 21,
   "we": 8.0,
   "hol": 0,
   "noWe": 0.0
  }
 },
 {
  "id": "lekar-31",
  "name": "Dadák",
  "active": true,
  "positions": [
   "plast"
  ],
  "max": null,
  "note": "",
  "typical24": 3.2,
  "fair": {
   "n24": 19,
   "we": 8.0,
   "hol": 2,
   "noWe": 0.5
  }
 },
 {
  "id": "lekar-32",
  "name": "Valouchová",
  "active": true,
  "positions": [
   "plast"
  ],
  "max": null,
  "note": "",
  "typical24": 3.2,
  "fair": {
   "n24": 19,
   "we": 11.5,
   "hol": 1,
   "noWe": 0.0
  }
 },
 {
  "id": "lekar-33",
  "name": "Michnáčová",
  "active": true,
  "positions": [
   "1A",
   "2A",
   "t1",
   "OUPd",
   "OUPn"
  ],
  "max": null,
  "note": "",
  "typical24": 2.8,
  "fair": {
   "n24": 17,
   "we": 6.5,
   "hol": 1,
   "noWe": 1.0
  }
 },
 {
  "id": "lekar-34",
  "name": "Pitrová",
  "active": true,
  "positions": [
   "1A",
   "2A",
   "t1",
   "OUPd",
   "OUPn"
  ],
  "max": null,
  "note": "",
  "typical24": 3,
  "fair": {
   "n24": 18,
   "we": 5.5,
   "hol": 2,
   "noWe": 1.0
  }
 },
 {
  "id": "lekar-35",
  "name": "Paulovičová",
  "active": true,
  "positions": [
   "1A",
   "2A",
   "t1",
   "OUPd",
   "OUPn"
  ],
  "max": null,
  "note": "",
  "typical24": 3,
  "fair": {
   "n24": 15,
   "we": 5.5,
   "hol": 0,
   "noWe": 0.0
  }
 },
 {
  "id": "lekar-36",
  "name": "Šimová",
  "active": true,
  "positions": [
   "1A",
   "2A",
   "t1"
  ],
  "max": null,
  "note": "",
  "typical24": 2.7,
  "fair": {
   "n24": 8,
   "we": 2.0,
   "hol": 0,
   "noWe": 1.0
  }
 },
 {
  "id": "lekar-37",
  "name": "Tomášková",
  "active": true,
  "positions": [
   "1A",
   "OUPd",
   "OUPn"
  ],
  "max": null,
  "note": "",
  "typical24": 2,
  "fair": {
   "n24": 12,
   "we": 4.0,
   "hol": 3,
   "noWe": 2.5
  }
 },
 {
  "id": "lekar-38",
  "name": "Pavlíková",
  "active": true,
  "positions": [
   "1A"
  ],
  "max": null,
  "note": "",
  "typical24": 3.2,
  "fair": {
   "n24": 19,
   "we": 7.5,
   "hol": 0,
   "noWe": 0.0
  }
 },
 {
  "id": "lekar-39",
  "name": "Tomancová",
  "active": true,
  "positions": [
   "2A",
   "t1",
   "t2",
   "OUPd",
   "OUPn"
  ],
  "max": null,
  "note": "",
  "typical24": 2.7,
  "fair": {
   "n24": 16,
   "we": 6.0,
   "hol": 2,
   "noWe": 1.0
  }
 },
 {
  "id": "lekar-40",
  "name": "Žabková",
  "active": true,
  "positions": [
   "2A",
   "t1",
   "OUPd",
   "OUPn"
  ],
  "max": null,
  "note": "",
  "typical24": 2.5,
  "fair": {
   "n24": 15,
   "we": 4.0,
   "hol": 1,
   "noWe": 2.0
  }
 },
 {
  "id": "lekar-41",
  "name": "Benčat",
  "oupHome": true,
  "active": true,
  "positions": [
   "2A",
   "t2",
   "OUPn"
  ],
  "max": null,
  "note": "",
  "typical24": 0.8,
  "fair": {
   "n24": 4,
   "we": 0.5,
   "hol": 0,
   "noWe": 2.5
  }
 },
 {
  "id": "lekar-42",
  "name": "Hric",
  "active": true,
  "positions": [
   "2A",
   "t1",
   "t2"
  ],
  "max": null,
  "note": "",
  "typical24": 2,
  "fair": {
   "n24": 12,
   "we": 5.5,
   "hol": 0,
   "noWe": 1.0
  }
 },
 {
  "id": "lekar-43",
  "name": "Kiššová",
  "active": true,
  "positions": [
   "2A",
   "t1",
   "t2"
  ],
  "max": null,
  "note": "",
  "typical24": 2.5,
  "fair": {
   "n24": 15,
   "we": 6.5,
   "hol": 0,
   "noWe": 0.5
  }
 },
 {
  "id": "lekar-44",
  "name": "Molčanová",
  "active": true,
  "positions": [
   "2A",
   "t1",
   "t2"
  ],
  "max": null,
  "note": "",
  "typical24": 2,
  "fair": {
   "n24": 12,
   "we": 2.5,
   "hol": 0,
   "noWe": 3.5
  }
 },
 {
  "id": "lekar-45",
  "name": "Mrázek",
  "active": true,
  "positions": [
   "2A",
   "t2"
  ],
  "max": null,
  "note": "",
  "typical24": 2,
  "fair": {
   "n24": 2,
   "we": 1.0,
   "hol": 0,
   "noWe": 0.0
  }
 },
 {
  "id": "lekar-46",
  "name": "Skotálek",
  "active": true,
  "positions": [
   "2A",
   "t1",
   "OUPd",
   "OUPn"
  ],
  "max": null,
  "note": "",
  "typical24": 2.5,
  "fair": {
   "n24": 15,
   "we": 6.0,
   "hol": 1,
   "noWe": 0.5
  }
 },
 {
  "id": "lekar-47",
  "name": "Škuligová",
  "active": true,
  "positions": [
   "2A",
   "t1",
   "t2"
  ],
  "max": null,
  "note": "",
  "typical24": 2.3,
  "fair": {
   "n24": 14,
   "we": 5.5,
   "hol": 0,
   "noWe": 1.0
  }
 },
 {
  "id": "lekar-48",
  "name": "Trnkócyová",
  "active": true,
  "positions": [
   "2A",
   "t1",
   "t2"
  ],
  "max": null,
  "note": "",
  "typical24": 2.3,
  "fair": {
   "n24": 14,
   "we": 5.0,
   "hol": 0,
   "noWe": 1.0
  }
 },
 {
  "id": "lekar-49",
  "name": "Vilhan",
  "active": true,
  "positions": [
   "2A",
   "t1",
   "t2"
  ],
  "max": null,
  "note": "",
  "typical24": 2.5,
  "fair": {
   "n24": 15,
   "we": 8.0,
   "hol": 1,
   "noWe": 0.0
  }
 },
 {
  "id": "lekar-50",
  "name": "Volavá",
  "active": true,
  "positions": [
   "2A",
   "t1",
   "t2"
  ],
  "max": null,
  "note": "",
  "typical24": 2.3,
  "fair": {
   "n24": 14,
   "we": 6.0,
   "hol": 0,
   "noWe": 0.5
  }
 },
 {
  "id": "lekar-51",
  "name": "Zubíková",
  "oupHome": true,
  "active": true,
  "positions": [
   "2A",
   "t2"
  ],
  "max": null,
  "note": "",
  "typical24": 1,
  "fair": {
   "n24": 5,
   "we": 2.0,
   "hol": 0,
   "noWe": 1.0
  }
 },
 {
  "id": "lekar-52",
  "name": "Halmová",
  "active": false,
  "positions": [
   "l2",
   "plast",
   "OUPd",
   "OUPn"
  ],
  "max": null,
  "note": "",
  "typical24": null,
  "fair": {
   "n24": 12,
   "we": 5.0,
   "hol": 1,
   "noWe": 0.0
  }
 },
 {
  "id": "lekar-53",
  "name": "Kolodějová",
  "active": false,
  "positions": [
   "l2",
   "1A",
   "plast"
  ],
  "max": null,
  "note": "",
  "typical24": null,
  "fair": {
   "n24": 12,
   "we": 5.5,
   "hol": 0,
   "noWe": 0.5
  }
 },
 {
  "id": "lekar-54",
  "name": "Třebová",
  "active": false,
  "positions": [
   "1A",
   "plast",
   "OUPd",
   "OUPn"
  ],
  "max": null,
  "note": "",
  "typical24": null,
  "fair": {
   "n24": 7,
   "we": 5.0,
   "hol": 0,
   "noWe": 0.0
  }
 },
 {
  "id": "lekar-55",
  "name": "Hereta",
  "active": false,
  "positions": [
   "plast",
   "OUPd",
   "OUPn"
  ],
  "max": null,
  "note": "",
  "typical24": null,
  "fair": {
   "n24": 11,
   "we": 0.5,
   "hol": 0,
   "noWe": 3.5
  }
 },
 {
  "id": "lekar-56",
  "name": "Pokrivčák",
  "active": false,
  "positions": [
   "1A",
   "t1",
   "OUPd",
   "OUPn"
  ],
  "max": null,
  "note": "",
  "typical24": null,
  "fair": {
   "n24": 9,
   "we": 2.5,
   "hol": 0,
   "noWe": 0.5
  }
 },
 {
  "id": "lekar-57",
  "name": "Procházková",
  "active": false,
  "positions": [
   "1A"
  ],
  "max": null,
  "note": "",
  "typical24": null,
  "fair": {
   "n24": 7,
   "we": 2.5,
   "hol": 0,
   "noWe": 1.5
  }
 }
];
