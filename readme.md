# gasket

Preconfigured pipelines for node.js

![logo](https://raw.githubusercontent.com/datproject/gasket/master/gasket.png)

```
$ npm install -g gasket
$ gasket # prints help
$ gasket completion --save # install tab completion
```

## Usage

To setup a pipeline add a `gasket` section to your package.json

```json
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
$ gasket run example # will print HELLO WORLD
```

`gasket` will spawn each command in the pipeline (it supports modules/commands installed via npm)
and pipe them together.

If you want to wait for the previous command to finish add `null` to the pipeline

```json
{
  "gasket": {
    "example": [
      "echo hello world",
      null,
      "echo hello afterwards"
    ]
  }
}
```

Running the above will print

```
hello world
hello afterwards
```

## Modules in pipelines

In addition to commands it supports node modules that return streams

```json
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

If your module reads/writes JSON object set `json:true` in the pipeline.
That will make gasket parse newline separated JSON before parsing the objects to the stream
and stringify the output.

Running `gasket run main` will produce `HELLO WORLD`

## Using gasket.json

If you don't have a package.json file you can add the tasks to a `gasket.json` file instead

```json
{
  "example": [
    "echo hello world",
    "transform-uppercase"
  ]
}
```

## gasket as a module

You can use gasket as a module as well

``` js
var gasket = require('gasket')

var pipelines = gasket({
  example: [
    "echo hello world",
    "transform-uppercase"
  ]
})

pipelines.run('example').pipe(process.stdout)
```
