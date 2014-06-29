# gasket

Preconfigured pipelines for node.js

```
$ npm install -g gasket
$ gasket # prints help
```

## Usage

To setup a pipeline add a `gasket` section to your package.json

```
{
  "name": "my-test-app",
  "dependencies" : {
    "transform-uppercase": "^1.0.0"
  },
  "gasket": {
    "example": [
      "echo hello world",
      "transform-uppercase"
    ]
  }
}
```

To run the above `example` pipeline simply to the repo and run

```
$ gasket example # will print HELLO WORLD
```

`gasket` will spawn each command in the pipeline (it supports modules/commands installed via npm)
and pipe them together.

## Modules in pipelines

In addition to commands it supports node modules that return streams

```
{
  "gasket": [
    "echo hello world",
    {"module":"./uppercase.js"}
  ]
}
```

Where `uppercase.js` is a file that looks like this

``` js
var through = require('through2')
module.exports = function() {
  return through(function(data, enc, cb) {
    cb(null, data.toString().toUpperCase())
  })
}
```

Running `gasket main` will produce `HELLO WORLD`

## Using gasket.json

If you don't have a package.json file you can add the tasks to a `gasket.json` file instead

```
{
  "example": [
    "echo hello world",
    "transform-uppercase"
  ]
}
```