var path = require('path')
var execspawn = require('npm-execspawn')
var xtend = require('xtend')
var resolve = require('resolve')
var ndjson = require('ndjson')
var duplexify = require('duplexify')
var pumpify = require('pumpify')
var fs = require('fs')
var multistream = require('multistream')
var debug = require('debug-stream')('gasket')

var compileModule = function(p, opts) {
  if (!p.exports) p.exports = require(resolve.sync(p.module, {basedir:opts.cwd}))
  return p.json ? pumpify(ndjson.parse(), p.exports(p), ndjson.serialize()) : p.exports(p)
}

var compileCommand = function(p, opts) {
  var child = execspawn(p.command, p.params, opts)

  child.on('exit', function(code) {
    if (code) result.destroy(new Error('Process exited with code: '+code))
  })

  if (opts.stderr === true) opts.stderr = process.stderr

  if (opts.stderr) child.stderr.pipe(opts.stderr)
  else child.stderr.resume()

  var result = duplexify(child.stdin, child.stdout)

  return result
}

var compile = function(name, pipeline, opts) {
  var wrap = function(i, msg, stream) {
    if (!process.env.DEBUG) return stream
    return pumpify(debug('#'+i+ ' stdin:  '+msg), stream, debug('#'+i+' stdout: '+msg))
  }

  pipeline = pipeline
    .map(function(p, i) {
      if (typeof p === 'string') p = {command:p}
      if (typeof p === 'function') p = {exports:p, module:true}
      if (!p.params) p.params = [].concat(name, opts.params || [])
      if (p.command) return wrap(i, '('+p.command+')', compileCommand(p, opts))
      if (p.module) return wrap(i, '('+p.module+')', compileModule(p, opts))
      throw new Error('Unsupported pipeline #'+i+' in '+name)
    })

  return pipeline.length > 1 ? pumpify(pipeline) : (pipeline[0] || multistream([]))
}

var split = function(pipeline) {
  var list = []
  var current = []

  pipeline = [].concat(pipeline || [])
  pipeline.forEach(function(p) {
    if (p) return current.push(p)
    list.push(current)
    current = []
  })

  if (current.length) list.push(current)
  return list
}

var gasket = function(config, defaults) {
  if (!defaults) defaults = {}
  if (!config) config = {}
  if (Array.isArray(config)) config = {main:config}

  var that = {}

  that.cwd = defaults.cwd = path.resolve(defaults.cwd || '.')
  that.env = defaults.env = defaults.env || process.env

  var pipes = Object.keys(config).reduce(function(result, key) {
    var list = split(config[key])

    result[key] = function(opts) {
      if (Array.isArray(opts)) opts = {params:opts}
      opts = xtend(defaults, opts)

      if (list.length < 2) return compile(key, list[0] || [], opts)

      var fns = list.map(function(pipeline, i) {
        return function() {
          var result = compile(key, pipeline, opts)

          result.on('error', function(err) {
            // we need to double error handle because
            // child process errors are emitted AFTER end
            dup.destroy(err)
          })

          if (i) result.end()
          return result
        }
      })

      var first = fns[0] = fns[0]()
      var dup = duplexify(first, multistream(fns))

      return dup
    }
    return result
  }, {})

  that.list = function() {
    return Object.keys(pipes)
  }

  that.has = function(name) {
    return !!pipes[name]
  }

  that.pipe = function(name, opts, extra) {
    if (Array.isArray(opts)) {
      extra = extra || {}
      extra.params = opts
      opts = extra
    }
    return pipes[name] && pipes[name](opts)
  }

  that.run = function(name, opts, extra) {
    var stream = that.pipe(name, opts, extra)
    stream.end()
    return stream
  }

  that.exec = function(cmd, params, opts) {
    if (!Array.isArray(params)) return that.exec(cmd, [], params)
    return compileCommand({command:cmd, params:['exec'].concat(params)}, opts || {})
  }

  that.toJSON = function() {
    return config
  }

  return that
}


gasket.load = function(cwd, opts, cb) {
  if (typeof opts === 'function') return gasket.load(cwd, null, opts)
  if (!opts) opts = {}

  var ready = function(pipelines, filename) {
    var name = path.basename(filename)
    if (name !== 'gasket.json') pipelines = pipelines.gasket || {}
    var g = gasket(pipelines, opts)
    g.config = filename
    cb(null, g)
  }

  var read = function(file, cb) {
    file = path.resolve(process.cwd(), path.join(cwd || '.', file))
    fs.readFile(file, 'utf-8', function(err, data) {
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

  read('.', function(err, data, filename) {
    // If it found ./package.json file but couldn't be parsed
    if (err && err.name === 'SyntaxError') return cb(err);
    if (data) return ready(data, filename);
    read('gasket.json', function(err, data, filename) {
      // If it found gasket.json it but couldn't be parsed
      if (err && err.name === 'SyntaxError') return cb(err);
      if (data) return ready(data, filename);
      read('package.json', function(err, data, filename) {
        if (err) return cb(err)
        ready(data, filename)
      })
    })
  })
}

module.exports = gasket
