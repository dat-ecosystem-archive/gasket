#!/usr/bin/env node

var minimist = require('minimist')
var gasket = require('./')

var argv = minimist(process.argv, {
  alias: {c:'config'},
  default: {config:process.cwd()}
})

if (argv.version) {
  console.log(require('./package').version)
  process.exit(0)
}

var onerror = function(err) {
  if (err.code === 'ENOENT') {
    console.error('Could not find gasket config (gasket.json or package.json)')
    process.exit(2)
  } else {
    console.error(err.message)
    process.exit(3)
  }
}

gasket.load(argv.config, function(err, tasks) {
  if (err) return onerror(err)

  var names = argv._.slice(2)

  var loop = function() {
    var name = names.shift()
    if (!name) return process.exit()
    if (!tasks[name]) return loop()
    tasks[name]().on('end', loop).pipe(process.stdout)
  }

  loop()
})