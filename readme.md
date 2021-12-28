[![deprecated](http://badges.github.io/stability-badges/dist/deprecated.svg)](https://dat-ecosystem.org/) 

More info on active projects and modules at [dat-ecosystem.org](https://dat-ecosystem.org/) <img src="https://i.imgur.com/qZWlO1y.jpg" width="30" height="30" /> 

---

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
      {
        "command": "echo hello world",
        "type": "pipe"
      },
      {
        "command": "transform-uppercase",
        "type": "pipe"
      }
    ]
  }
}
```

To run the above `example` pipeline simply to the repo and run

```
$ gasket run example # will print HELLO WORLD
```

`gasket` will spawn each command in the pipeline (it supports modules/commands installed via npm)
and pipe them together (if the type is set to "pipe").

If you want to wait for the previous command to finish, set the type to "run" instead.

```json
{
  "gasket": {
    "example": [
      {
        "command": "echo hello world",
        "type": "run"
      },
      {
        "command": "echo hello afterwards",
        "type": "run"
      }
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
    {
      "command": "echo hello world",
      "type": "pipe"
    }
    {
      "command": {"module":"./uppercase.js"},
      "type": "pipe"
    }
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
    {
      "command": "echo hello world",
      "type": "pipe"
    },
    {
      "command": "transform-uppercase",
      "type": "pipe"
    }
  ]
}
```

## gasket as a module

You can use gasket as a module as well

``` js
var gasket = require('gasket')

var pipelines = gasket({
  example: [
    {
      "command": "echo hello world",
      "type": "pipe"
    },
    {
      "command": "transform-uppercase",
      "type": "pipe"
    }
  ]
})

pipelines.run('example').pipe(process.stdout)
```
