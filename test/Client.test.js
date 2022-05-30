const assert = require('assert')
const mockhttp = require('mockttp')
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
  describe('getLatestUpdated() via proxy', function () {
    let mockServer
    beforeEach(async () => {
      const https = await mockhttp.generateCACertificate()
      mockServer = mockhttp.getLocal({ https })
      return mockServer.start()
    })
    afterEach(() => mockServer.stop())
    it('shall get last updated folder with dates', async function () {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
      const GFS_BASE_URL = 'https://www.ftp.ncep.noaa.gov/data/nccf/com/gfs/prod'
      const GFS_FILE_URL = 'https://www.ftp.ncep.noaa.gov/data/nccf/com/gfs/prodgfs.20220521'
      await mockServer.forGet(GFS_BASE_URL).thenReply(200, '<a href="gfs.20220521/">gfs.20220521/</a>')
      await mockServer.forGet(GFS_FILE_URL).thenReply(200, '<a href="00/">00/</a>')
      const client = new Client(GFS_BASE_URL, mockServer.url)
      const date = await client.getLatestUpdate()
      assert.deepStrictEqual(date, new Date('2022-05-21T00:00:00.000Z'))
    })
  })
})
