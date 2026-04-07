# TRIED 4/7/26

There are SO MANY oscilloscope things for js.
Most of them seem very old?

## `npm install oscilloscope` - no joy

That's this one -
https://www.npmjs.com/package/oscilloscope
https://github.com/mathiasvr/audio-oscilloscope

but it doesn't seem to work with `import`:

```js

// this and variations of it
import * as oscilloscope from 'oscilloscope'

```

result:
```
[plugin:vite:import-analysis] Failed to resolve entry for package "oscilloscope". The package may have incorrect main/module/exports specified in its package.json
```

It may be because there's no `exports` declaration in package.json, or
something like that


Iris found this workaround to use `require` in a modern app, didn't work:

```js

import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const oscilloscope = require('oscilloscope')

```

```
__vite-browser-external:module:3 Uncaught Error: Module "module" has been externalized for browser compatibility. Cannot access "module.createRequire" in client code.  See https://vite.dev/guide/troubleshooting.html#module-externalized-for-browser-compatibility for more details.
    at Object.get (__vite-browser-external:module:3:13)
    at main.js:15:125
```


# Next steps:

- try vanilla visualization stuff from MDN article?

  - using vanilla WebAudio, not tone.js

Another blog about doing from scratch:
https://davidmatthew.ie/creating-an-oscilloscope-with-javascript/
