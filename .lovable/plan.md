# Fix selected V2 map-pin styling

## Implementation
- Extend only the `map.marker` active-state selector so it also applies when the real marker reports `data-marker-state="selected"`.
- Preserve the existing inspector-forced state, V1 behavior, navigation controls, and marker metadata.
- Add a mounted regression covering selected, forced-active, default, visited, and V1 marker rendering inside the real style scope.

## Validation
- Run the focused V2 tests and confirm the preview build remains healthy.
- Do not publish, activate V2, run SQL, or write customer data.
