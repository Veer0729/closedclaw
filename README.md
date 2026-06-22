# closedclaw

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.3.11. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

# inside index.ts
```
#! /usr/bin/env bun
```
> this is called shebang
> it tells my computer that he has to run this file using bun

# inside package.json
```
"bin": {
    "closedclaw-build": "./index.ts"
  }
```
> this tells to create a cli command named "closedclaw-build", and then it exectues index.ts

# bun link
> this tells my bun to register my command globally as a tool