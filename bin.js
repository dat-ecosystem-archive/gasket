#!/usr/bin/env node

var minimist = require('minimist')
var gasket = require('./')

var argv = minimist(process.argv, {
  alias: {c:'config', v:'version', l:'list'},
  default: {config:process.cwd()},
  boolean: ['list', 'version'],
  '--': true
})

var names = argv._.slice(2)
if (!names.length) names.push('main')

if (argv.version) {
  console.log(require('./package').version)
  process.exit(0)
}

var help = function() {
  console.error('Usage: gasket [options] [task1] [task2] ...')
  console.error()
  console.error('  --config,  -c  To explicitly set the gasket config file/dir')
  console.error('  --version, -v  Print the installed version')
  console.error('  --list,    -l  List available gasket tasks')
  console.error()
}

if (argv.help) {
  help()
  process.exit()
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

var params = argv['--']

gasket.load(argv.config, {stderr:true, params:params}, function(err, tasks) {
  if (err) return onerror(err)
  if (argv.list) return Object.keys(tasks).length && console.log(Object.keys(tasks).join('\n'))

  var loop = function() {
    var name = names.shift()
    if (!name) return
    if (!tasks[name]) {
      if (name !== 'main') console.error(name+' does not exist')
      return loop()
    }
    process.stdin.pipe(tasks[name]().on('end', loop)).pipe(process.stdout)
    process.stdin.unref()
  }

  loop()
})