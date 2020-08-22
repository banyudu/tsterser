// workaround for tty output truncation upon process.exit()
const exit = process.exit
process.exit = function () {
  const args = [].slice.call(arguments)
  process.once('uncaughtException', function () {
    (function callback () {
      if (process.stdout.bufferSize || process.stderr.bufferSize) {
        setImmediate(callback)
      } else {
        exit.apply(process, args)
      }
    })()
  })
  throw exit
}
