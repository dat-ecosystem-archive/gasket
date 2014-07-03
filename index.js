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

  if (opts.stderr) child.stderr.pipe(process.stderr)
  else child.stderr.resume()

  return duplexer(child.stdin, child.stdout)
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
  if (Array.isArray(config)) config = {main:config}

  defaults.cwd = path.resolve(defaults.cwd || '.')
  defaults.env = defaults.env || process.env

  return Object.keys(config).reduce(function(result, key) {
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
}


gasket.load = function(cwd, opts, cb) {
  if (typeof opts === 'function') return gasket.load(cwd, null, opts)
  if (!opts) opts = {}

  var read = function(file, cb) {
    file = path.join(cwd, file)
    fs.readFile(file, 'utf-8', function(err, data) {
      if (err) return cb(err)

      try {
        data = JSON.parse(data)
      } catch (err) {
        return cb(err)
      }

      opts.cwd = path.dirname(file)
      cb(null, data)
    })
  }

  read('.', function(err, data) {
    if (data) return cb(null, gasket(data.gasket || data, opts))
    read('gasket.json', function(err, data) {
      if (data) return cb(null, gasket(data, opts))
      read('package.json', function(err, data) {
        if (err) return cb(err)
        cb(null, gasket(data.gasket || {}, opts))
      })
    })
  })
}

module.exports = gasket