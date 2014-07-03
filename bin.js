#!/usr/bin/env node

var tab = require('tabalot')
var fs = require('fs')
var path = require('path')
var gasket = require('./')

var help = function(code) {
  console.log(fs.readFileSync(path.join(__dirname, 'help.txt'), 'utf-8'))
  process.exit(code)
}

var onerror = function(err) {
  console.error(err.message || err)
  process.exit(2)
}

var save = function(filename, data) {
  var write = function(data) {
    fs.writeFile(filename, JSON.stringify(data, null, 2), function(err) {
      if (err) return onerror(err)
      process.exit()
    })
  }

  if (path.basename(filename) === 'gasket.json') return write(data)

  fs.readFile(filename, 'utf-8', function(err, pkg) {
    if (err) return onerror(err)
    try {
      pkg = JSON.parse(pkg)
    } catch (err) {
      return onerror(err)
    }
    pkg.gasket = data
    write(pkg)
  })
}

var load = function(opts, cb) {
  gasket.load(opts.config, function(err, g) {
    if (err) return onerror(err)
    cb(g)
  })
}

// completions

var bin = function(cb) {
  fs.readdir('node_modules/.bin', cb)
}

var pipes = function(pipe, opts, cb) {
  load(opts, function(gasket) {
    cb(null, gasket.list().filter(function(pipe) {
      return opts._.indexOf(pipe, 1) === -1
    }))
  })
}

// commands

tab()
  ('--config', '-c', '@file')

tab('ls')
  (function(opts) {
    load(opts, function(gasket) {
      console.log(gasket.list().join('\n'))
    })
  })

tab('exec')
  ('*', bin)
  (function(opts) {
    if (!opts._.length) return onerror('Usage: gasket exec [commands...]')
    load(opts, function(gasket) {
      process.stdin
        .pipe(gasket.exec(opts._.join(' '), opts['--'] || [], {stderr:true})).on('end', process.exit)
        .pipe(process.stdout)
    })
  })

tab('version')
  (function() {
    console.log(require('./package').version)
  })

tab('help')
  (function() {
    help(0)
  })

tab('add')
  (pipes)
  ('*', bin)
  (function(pipe, opts) {
    if (!pipe || opts._.length < 3) return onerror('Usage: gasket add [pipe] [command]')

    load(opts, function(gasket) {
      var data = gasket.toJSON()
      if (!data[pipe]) data[pipe] = []
      data[pipe].push(opts._.slice(2).join(' '))
      save(gasket.config, data)
    })
  })

tab('show')
  (pipes)
  (function(pipe, opts) {
    if (!pipe) pipe = 'main'
    load(opts, function(gasket) {
      pipe = (gasket.toJSON()[pipe] || [])
        .map(function(line) {
          return line ? (' | '+line) : '\n'
        })
        .join('').split('\n')
        .map(function(line) {
          return line.replace(/^ \| /, '')
        })
        .join('\n').trim()

      console.log(pipe)
    })
  })

tab('rm')
  (pipes)
  (function(pipe, opts) {
    if (!pipe) return onerror('Usage: gasket rm [pipe]')

    load(opts, function(gasket) {
      var data = gasket.toJSON()
      delete data[pipe]
      save(gasket.config, data)
    })
  })

tab('run')
  ('*', pipes)
  (function(opts) {
    var names = opts._.slice(1)
    if (!names.length) names = ['main']

    load(opts, function(gasket) {
      var first = true
      var loop = function() {
        var name = names.shift()
        if (!name) return process.exit()

        if (!gasket.has(name)) {
          if (name !== 'main') console.error(name+' does not exist')
          return loop()
        }

        var t = gasket.run(name, opts['--'] || [])

        if (first) {
          first = false
          process.stdin.pipe(t)
        }

        t.pipe(process.stdout)
        t.on('end', loop)
      }

      loop()
    })
  })

tab.parse({'--':true}) || help(1)