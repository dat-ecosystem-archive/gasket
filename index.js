var path = require('path')
var execspawn = require('execspawn')
var xtend = require('xtend')
var resolve = require('resolve')
var ldjson = require('ldjson-stream')
var splicer = require('stream-splicer')
var duplexer = require('duplexer2')

var PATH_SEP = process.platform === 'win32' ? ';' : ':'

var npmRunPath = function(cwd, PATH) {
  var prev = cwd
  var result = []
  while (true) {
    result.push(path.join(cwd, 'node_modules/.bin'))
    var parent = path.join(cwd, '..')
    if (parent === cwd) return result.concat(PATH).join(PATH_SEP)
    cwd = parent
  }
}

var compileModule = function(p, opts) {
  if (!p.exports) p.exports = require(resolve.sync(p.module, {basedir:opts.cwd}))
  return p.json ? splicer(ldjson.parse(), p.exports(p), ldjson.serialize()) : p.exports(p)
}

var compileCommand = function(p, opts) {
  var env = xtend({PATH:npmRunPath(opts.cwd, opts.env.PATH || process.env.PATH)}, opts.env)
  var child = execspawn(p.command, {
    env: env,
    cwd: opts.cwd
  })

  child.stderr.resume()
  return duplexer(child.stdin, child.stdout)
}

var compile = function(name, pipeline, opts) {
  pipeline = pipeline
    .map(function(p, i) {
      if (typeof p === 'string') p = {command:p}
      if (typeof p === 'function') p = {exports:p, module:true}
      if (p.command) return compileCommand(p, opts)
      if (p.module) return compileModule(p, opts)
      throw new Error('Unsupported pipeline #'+i+' in '+name)
    })

  return splicer(pipeline)
}

module.exports = function(config, opts) {
  if (!opts) opts = {}

  opts.cwd = path.resolve(opts.cwd || '.')
  opts.env = opts.env || process.env

  return Object.keys(config).reduce(function(result, key) {
    var pipeline = [].concat(config[key] || [])
    result[key] = function() {
      return compile(key, pipeline, opts)
    }
    return result
  }, {})
}