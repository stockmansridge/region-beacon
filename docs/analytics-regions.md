# Australian postcode regions

The bundled lookup covers 2,641 ABS 2021 Postal Areas, derived from the ABS ASGS Edition 3 postcode-to-SA4, postcode-to-GCCSA and postcode-to-SA2 correspondences.

Source: https://data.gov.au/data/dataset/2c79581f-600e-4560-80a8-98adb1922dfc/resource/33d822ba-138e-47ae-a15f-460279c3acc3/download/asgs2021correspondences.zip

Copyright Australian Bureau of Statistics. Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Data has been transformed into a compact lookup; these are not official tourism regions or Australia Post delivery boundaries.

## Non-overlapping area policy
- Use the highest population-weight SA4 allocation, and its geography hierarchy for state/territory.
- Roll capital city areas up to their dominant GCCSA (e.g. Greater Sydney).
- Blue Mountains is the ABS SA3 12401 subset: assign postcodes where more than half the allocation is to its SA2s to Blue Mountains instead of Greater Sydney. Thus Greater Sydney in this custom report excludes the assigned Blue Mountains postcodes.
- Outside capital cities retain the SA4 label, e.g. Central West NSW.
- A postcode split between regions is assigned once, never duplicated. Results are approximate.
- Non-street-delivery/PO-box postcodes, foreign or malformed entries, and codes absent from the 2021 edition remain Unknown / unmapped. No numeric-range guessing.
- Percentages include all visitor records with a supplied postcode, including unmapped codes. Missing postcodes are counted separately by the page. These are visitor percentages, not percentages of distinct postcode strings.

The State tab rolls these allocations up to state/territory. No visitor postcode is sent to an external lookup service.