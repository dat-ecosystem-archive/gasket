var path = require('path')
var execspawn = require('npm-execspawn')
var xtend = require('xtend')
var resolve = require('resolve')
var ldjson = require('ldjson-stream')
var splicer = require('stream-splicer')
var duplexer = require('duplexer2')
var stream = require('stream')
var fs = require('fs')

var compileModule = function(p, opts) {
  if (!p.exports) p.exports = require(resolve.sync(p.module, {basedir:opts.cwd}))
  return p.json ? splicer(ldjson.parse(), p.exports(p), ldjson.serialize()) : p.exports(p)
}

var compileCommand = function(p, opts) {
  var child = execspawn(p.command, p.params, opts)
  var out

  if (opts.stderr) {
    out = stream.PassThrough()
    child.stderr.pipe(out, {end:false})
    child.stdout.pipe(out, {end:false})

    var count = 0
    var onend = function() {
      if (++count === 2) out.end()
    }

    child.stdout.once('end', onend)
    child.stderr.once('end', onend)
  } else {
    out = child.stdout
    child.stderr.resume()
  }

  return duplexer(child.stdin, out)
}

var compile = function(name, pipeline, opts) {
  pipeline = pipeline
    .map(function(p, i) {
      if (typeof p === 'string') p = {command:p}
      if (typeof p === 'function') p = {exports:p, module:true}
      if (!p.params) p.params = [].concat(name, opts.params || [])
      if (p.command) return compileCommand(p, opts)
      if (p.module) return compileModule(p, opts)
      throw new Error('Unsupported pipeline #'+i+' in '+name)
    })

  return splicer(pipeline)
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

      var output = new stream.PassThrough()
      var s = splicer(output)
      var i = 0

      var loop = function() {
        var next = compile(key, list[i++], opts)
        if (i === list.length) return s.unshift(next)
        next.on('end', function() {
          s.shift()
          loop()
        })
        s.unshift(next)
      }

      loop()

      return s
    }
    return result
  }, {})

  that.list = function() {
    return Object.keys(pipes)
  }

  that.has = function(name) {
    return !!pipes[name]
  }

  that.run = function(name, opts) {
    return pipes[name] && pipes[name](opts)
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
    if (err.name === 'SyntaxError') {
      cb(err);
    }
    else if (data) return ready(data, filename);
    read('gasket.json', function(err, data, filename) {
      // If it found gasket.json it but couldn't be parsed
      if (err.name === 'SyntaxError') {
        cb(err);
      }
      else if (data) return ready(data, filename);
      read('package.json', function(err, data, filename) {
        if (err) return cb(err)
        ready(data, filename)
      })
    })
  })
}

module.exports = gasket
