const assert = require('assert')
const { Client } = require('../src/index')

const HOUR = 3600000

describe('#Client', function () {
  describe('getLastUpdated()', function () {
    it('shall get last updated folder with dates', function (done) {
      this.timeout(10000)
      const client = new Client()
      client.getLatestUpdate()
        .then(date => {
          const diffHours = (Date.now() - date.getTime()) / HOUR
          assert.ok(diffHours < 12, 'max difference in hours shall be 12')
          done()
        })
    })
  })
})
