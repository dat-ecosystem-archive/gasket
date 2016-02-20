var path = require('path')
var execspawn = require('npm-execspawn')
var xtend = require('xtend')
var resolve = require('resolve')
var ndjson = require('ndjson')
var duplexify = require('duplexify')
var pumpify = require('pumpify')
var fs = require('fs')
var multistream = require('multistream')
var parallel = require('parallel-multistream')
var debug = require('debug-stream')('gasket')

/*  Create a stream with cmd and opts*/
var toStream = function (cmd, opts) {
  var child = execspawn(cmd.command, cmd.params, opts)
  child.on('exit', function (code) {
    if (code) result.destroy(new Error('Process exited with code: ' + code))
  })

  if (opts.stderr === true) opts.stderr = process.stderr

  if (opts.stderr) child.stderr.pipe(opts.stderr)
  else child.stderr.resume()

  var result = duplexify(child.stdin, child.stdout)
  return result
}

/*  Create a stream which runs runCommands in sequence */
var runStream = function (runCommands) {
  var commands = runCommands.map(function (cmd) {
    var fn = function () {
      if (cmd.end) cmd.end() // not writable
      return cmd
    }
    return fn()
  })
  return multistream(commands)
}

/* Run forkCommands in parallel */
var forkStream = function (forkCommands) {
  var commands = forkCommands.map(function (cmd) {
    // no lazyness here since we are forking
    if (cmd.end) cmd.end() // not writable
    return cmd
  })
  return parallel(commands)
}

/* Pipe pipeCommands together */
var pipeStream = function (pipeCommands) {
  var pipe = pumpify(pipeCommands)
  pipe.end() // first not writable
  return pipe
}

/* Map commands according to type */
var mapToStream = function (commands, type) {
  var func
  // Map first command in commands to the rest
  if (type === 'map') func = function (p) { pipes.push(pipeStream([first, p])) }
  // Map the rest of the commands to the first command
  if (type === 'reduce') func = function (p) { pipes.push(pipeStream([p, first])) }
  var pipes = []
  var first = commands.shift()
  commands.map(func)
  return forkStream(pipes)
}

var compileModule = function (p, opts) {
  if (!p.exports) p.exports = require(resolve.sync(p.module, {basedir: opts.cwd}))
  return p.json ? pumpify(ndjson.parse(), p.exports(p), ndjson.serialize()) : p.exports(p)
}

var compile = function (name, pipeline, opts) {
  var wrap = function (i, msg, stream) {
    if (!process.env.DEBUG) return stream
    return pumpify(debug('#' + i + ' stdin:  ' + msg), stream, debug('#' + i + ' stdout: ' + msg))
  }
  var type = pipeline[0].type
  var visit = function (p, i) {
    if (typeof p === 'object') p = {command: p.command}
    if (typeof p === 'function') p = {exports: p, module: true}
    if (!p.params) p.params = [].concat(name, opts.params || [])
    if (p.command) return wrap(i, '(' + p.command + ')', toStream(p, opts))
    if (p.module) return wrap(i, '(' + p.module + ')', compileModule(p, opts))
    throw new Error('Unsupported pipeline #' + i + ' in ' + name)
  }
  pipeline = pipeline.map(visit)
  return [type, pipeline]
}

var split = function (pipeline) {
  var list = []
  var current = []

  var prevType = null
  var visit = function (p) {
    if (p.type === prevType) {
      return current.push(p)
    } else {
      prevType = p.type
      if (current.length) list.push(current)
      current = []
      current.push(p)
      return
    }
  }
  pipeline = [].concat(pipeline || [])
  pipeline.map(visit)

  if (current.length) list.push(current)
  return list
}

var gasket = function (config, defaults) {
  if (!defaults) defaults = {}
  if (!config) config = {}
  if (Array.isArray(config)) config = {main: config}

  var that = {}

  that.cwd = defaults.cwd = path.resolve(defaults.cwd || '.')
  that.env = defaults.env = defaults.env || process.env

  var pipes = Object.keys(config).reduce(function (result, key) {
    var list = split(config[key])

    result[key] = function (opts) {
      if (Array.isArray(opts)) opts = {params: opts}
      opts = xtend(defaults, opts)

      var mainPipeline = []
      var bkgds = []
      list.forEach(function (pipeline) {
        var compiled = compile(key, pipeline, opts)
        var type = compiled[0]
        var p = compiled[1]
        switch (type) {
          case ('pipe'):
            mainPipeline.push(pipeStream(p))
            break
          case ('run'):
            mainPipeline.push(runStream(p))
            break
          case ('fork'):
            mainPipeline.push(forkStream(p))
            break
          case ('background'):
            bkgds = bkgds.concat(p)
            break
          case ('map'):
            mainPipeline.push(mapToStream(p, 'map'))
            break
          case ('reduce'):
            mainPipeline.push(mapToStream(p, 'reduce'))
            break
          default:
            throw new Error('Unsupported Type: ' + type)
        }
      })

      mainPipeline = runStream(mainPipeline)

      // Handle background processes
      if (bkgds.length) {
        bkgds = forkStream(bkgds)
        mainPipeline.on('end', function () {
          bkgds.destroy()
        })
        return parallel([mainPipeline, bkgds])
      }

      return mainPipeline
    }
    return result
  }, {})

  that.list = function () {
    return Object.keys(pipes)
  }

  that.has = function (name) {
    return !!pipes[name]
  }

  that.pipe = function (name, opts, extra) {
    if (Array.isArray(opts)) {
      extra = extra || {}
      extra.params = opts
      opts = extra
    }
    return pipes[name] && pipes[name](opts)
  }

  that.run = function (name, opts, extra) {
    var stream = that.pipe(name, opts, extra)
    if (stream.end) stream.end()
    return stream
  }

  that.exec = function (cmd, params, opts) {
    if (!Array.isArray(params)) return that.exec(cmd, [], params)
    return toStream({command: cmd, params: ['exec'].concat(params)}, opts || {})
  }

  that.toJSON = function () {
    return config
  }
  return that
}

gasket.load = function (cwd, opts, cb) {
  if (typeof opts === 'function') return gasket.load(cwd, null, opts)
  if (!opts) opts = {}

  var ready = function (pipelines, filename) {
    var name = path.basename(filename)
    if (name !== 'gasket.json') pipelines = pipelines.gasket || {}
    var g = gasket(pipelines, opts)
    g.config = filename
    cb(null, g)
  }

  var read = function (file, cb) {
    file = path.resolve(process.cwd(), path.join(cwd || '.', file))
    fs.readFile(file, 'utf-8', function (err, data) {
      if (err) return cb(err)

      try {
        data = JSON.parse(data)
      } catch (err) {
        return cb(err)
      }

      opts.cwd = path.dirname(file)
      cb(null, data, file)
    })
  }

  read('.', function (err, data, filename) {
    // If it found ./package.json file but couldn't be parsed
    if (err && err.name === 'SyntaxError') return cb(err)
    if (data) return ready(data, filename)
    read('gasket.json', function (err, data, filename) {
      // If it found gasket.json it but couldn't be parsed
      if (err && err.name === 'SyntaxError') return cb(err)
      if (data) return ready(data, filename)
      read('package.json', function (err, data, filename) {
        if (err) return cb(err)
        ready(data, filename)
      })
    })
  })
}

module.exports = gasket
