/* global describe, it, before */

const assert = require('assert')
const Downloader = require('../src/index').Downloader
const mkdirp = require('mkdirp')
const path = require('path')

describe('#Downloader', function () {
  var config = {
    latestUpdate: null,
    target: path.resolve(__dirname, '/tmp/gfs-downloader'),
    forecastStart: 0, // now up to
    forecastEnd: 12, // 12 hour forecast
    fields: [{
      name: 'TMP',
      surface: 'surface',
      resolution: 1
    }]
  }

  describe('#uploadtime', function () {
    it('can correct the date of uploading on the servers', function () {
      var dl = new Downloader(config)
      var date = dl.uploadtime('2016-10-20T13:17:00')
      assert.strictEqual(date.toISOString(), '2016-10-20T06:00:00.000Z')
    })

    it('can correct the date of uploading on the servers #2', function () {
      var dl = new Downloader(config)
      var date = dl.uploadtime('2016-10-20T00:17:01')
      assert.strictEqual(date.toISOString(), '2016-10-19T12:00:00.000Z')
    })
  })

  describe('#update', function () {
    before(function (done) {
      mkdirp(config.target, done)
    })

    it('can download pgrb2 files from server', function (done) {
      this.timeout(20000)
      var dl = new Downloader(config)
      var date = dl.uploadtime()
      dl.update(date).then(
        ([files, generatedDate]) => {
          assert.strictEqual(generatedDate, date)
          assert.ok(Array.isArray(files))
          assert.deepStrictEqual(Object.keys(files[0]).sort(), [ 'file', 'forecast', 'name', 'resolution', 'surface' ])
          assert.strictEqual(files.length, 5)
          done()
        },
        (err) => {
          done(err)
        }
      )
    })

    it('can download sfluxgrb files from server', function (done) {
      var config = {
        latestUpdate: null,
        target: path.resolve(__dirname, '/tmp/gfs-downloader'),
        forecastStart: 0, // now up to
        forecastEnd: 12, // 12 hour forecast
        fields: [{
          name: 'PRATE',
          surface: 'surface',
          process: ['to-regular', 90, 0, 1, 1, 360, 181]
        }]
      }

      this.timeout(20000)
      var dl = new Downloader(config)
      var date = dl.uploadtime()
      dl.update(date).then(
        ([files, generatedDate]) => {
          assert.strictEqual(generatedDate, date)
          assert.ok(Array.isArray(files))
          assert.deepStrictEqual(Object.keys(files[0]).sort(), [ 'file', 'forecast', 'name', 'process', 'surface' ])
          assert.strictEqual(files.length, 5) //
          done()
        },
        (err) => {
          done(err)
        }
      )
    })
  })
})
