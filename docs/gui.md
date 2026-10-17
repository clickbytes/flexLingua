# Studio GUI — current status

Studio is temporarily unavailable in the current CLI-only runtime. The browser page, server launcher, and UI source files are retained, but this repository no longer has a browser plugin loader for them. The small `js/main.js` entry point reports this state; it does not initialize or claim a working Studio.

Use [the Node translation CLI](cli.md) and its manual examples to inspect supported language behavior. Studio's implementation and layout are frozen and outside the current CLI acceptance path. A future browser runtime needs its own scoped design and verification.
