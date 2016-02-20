var gasket = require('./')
var through = require('through2')
console.log('running pipeline...')

var pipeline = {
  'example': [{
    'type': 'pipe',
    'command': 'echo hello world'
  }, {
    'type': 'pipe',
    'command': 'transform-uppercase'
  }]
}

var pipelines = gasket(pipeline)
var stringifier = through.obj(function (buff, enc, next) {
  next(null, buff.toString())
})

pipelines.run('example').pipe(stringifier).pipe(process.stdout)

stringifier.on('finish', function () {
  console.log('stringify finish')
})
