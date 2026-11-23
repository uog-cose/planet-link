# Frontend CSS cleanup

This pass removes stylesheet selectors that have no matching class reference in the project source. It is deliberately conservative: class names assembled at runtime, responsive and state selectors, theme variables, animation/keyframe rules, imported library styles, and selectors referenced by source literals are retained.

## Changes

- Removed 518 unused CSS rules and 668 unused selector branches across the main frontend stylesheets.
- Reduced the main stylesheet set from 409,918 bytes to 352,517 bytes (57,401 bytes, approximately 14%).
- Kept all stylesheet modules and their import order; no stylesheet or theme module was deleted.
- Kept the quick-login stylesheet because its selectors are referenced by the quick-login component.

## Validation and limitations

- All cleaned stylesheet files were parsed again with `tinycss2`; no top-level CSS parse errors were found.
- The frontend production build could not be completed in this environment because the archive does not include `node_modules` or a package lockfile, and React/Vite dependencies are not installed.
- This is a conservative source-reference cleanup, not a guarantee that every remaining selector is used at runtime. Runtime-generated classes and third-party components should still be smoke-tested in the local Docker environment.
