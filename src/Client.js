import fs from 'fs'
import request from 'superagent'
import Cache from 'node-cache'
import arrayMax from 'lodash.max'
import padStart from 'lodash.padstart'
import debugFactory from 'debug'
import shouldProxy from 'should-proxy'
import superagentProxy from 'superagent-proxy'

const debug = debugFactory('gfs.client')
const GFS_BASE_URL = 'https://www.ftp.ncep.noaa.gov/data/nccf/com/gfs/prod/'
const NOOP = () => {}

/**
 * helper function to get year, month, day and hour
 * @private
 */
function getDate (date) {
  const y = date.getFullYear()
  const m = padStart(date.getMonth() + 1, 2, '0')
  const d = padStart(date.getDate(), 2, '0')
  const h = padStart(date.getUTCHours(), 2, '0')
  return { y, m, d, h }
}

function getProxy (url, proxy, noProxy) {
  if (!proxy) return
  if (noProxy && !shouldProxy(url, { noProxy })) {
    return
  }
  return proxy
}

/**
 *
 */
export default class Client {
  constructor (baseUrl = GFS_BASE_URL, proxy, noProxy) {
    this.baseUrl = baseUrl
    this.cache = new Cache({
      stdTTL: 60
    })

    this.proxy = getProxy(baseUrl, proxy, noProxy)
    this.request = this.proxy ? superagentProxy(request) : request
  }

  /**
   * Returns the latest available forecast date
   * @return {object}
   */
  getLatestUpdate () {
    debug(`Find latest folder on ${this.baseUrl}`)

    return new Promise((resolve, reject) => {
      // first lookup for date
      this.__get((err, res) => {
        if (err) return reject(err)
        const dates = res.match(/gfs\.\d{8}/g)
        const max = arrayMax(dates.map(d => parseInt(d.substr(4))))
        // second lookup for hour
        this.__get(`gfs.${max}`, (err, res) => {
          if (err) return reject(err)
          const dates = res.match(/>\d{2}/g)
          const max2 = arrayMax(dates.map(d => parseInt(max + d.substr(1))))
          resolve(this.__parseDate(max2.toString()))
        })
      })
    })
  }

  /**
   * Reads the grib inventory for a given grib file url
   * @param  {string} fileUrl
   * @return {object}
   */
  getGribIndex (fileUrl) {
    return new Promise((resolve, reject) => {
      this.__get(`${fileUrl}.idx`, (err, res) => {
        if (err) return reject(err)

        const index = []
        let i = 0

        res.split(/\n/).forEach((line) => {
          let [num, start, date, name, surface] = line.split(/:/)
          if (start === undefined) return // Skip empty lines

          num = parseInt(num)
          start = parseInt(start)
          date = this.__parseDate(date.substr(2))

          if (i > 0) {
            index[i - 1].end = start - 1
          }

          index[i++] = {
            num, name, surface, date, start, // eslint-disable-line
            end: undefined,
            url: this.baseUrl + fileUrl
          }
        })

        resolve(index)
      })
    })
  }

  /**
   * Downloads a field from grib2 file. The file and and part is matched based
   * on the date, the grib2 file was generated, the forecasted hour and field
   * name and surface as specified in grib2 indexes.
   * Returns a promise which is resolved with an object having the same props
   * as the `field` parameter, extended with the key `file`, containing the file
   * name `localPath` is pointing to.
   *
   * @param {Date} generatedDate
   * @param {Number} forecastOffset
   * @param {Object} field
   * @param {String} localPath
   * @param {Function} progressCb
   * @return {Promise}
   */
  downloadField (generatedDate, forecastOffset, field, localPath, progressCb = NOOP) {
    const { y, m, d, h } = getDate(generatedDate)
    const gfsFileName = this.__resolveFileName(
      generatedDate.getUTCHours(),
      field.name,
      field.resolution,
      forecastOffset
    )
    if (!gfsFileName) { // special case for sfluxgrb with forecastOffset===0
      return Promise.resolve()
    }
    const url = `gfs.${y}${m}${d}/${h}/atmos/${gfsFileName}`
    return this.getGribIndex(url).then((index) => {
      const entry = index.find(
        (entry) => entry.name === field.name && entry.surface === field.surface
      )

      if (!entry) {
        return Promise.reject(new Error(
          `Field ${field.name}@${field.surface} not found at ${url}`
        ))
      }

      return this.__checkFile(localPath, entry)
        .then((skip) => {
          if (skip) {
            debug(`${localPath} already downloaded`)
            return localPath
          }

          debug(`download ${field.name}@${field.surface} from ${url}`)
          return this.__download(
            entry.url,
            localPath,
            entry.start,
            entry.end,
            progressCb
          )
        })
        .then((path) => ({
          ...field,
          file: path
        }))
    })
  }

  __checkFile (localPath, entry) {
    return new Promise((resolve, reject) => {
      fs.stat(localPath, (err, stats) => {
        if (err) return resolve(false)
        debug('File exists already, compare size ...')
        return resolve((entry.end - entry.start + 1) === stats.size)
      })
    })
  }

  __get (path = '', cb) {
    if (arguments.length === 1) {
      cb = path
      path = ''
    }

    const url = this.baseUrl + path
    debug(`Fetch ${url}`)

    const cachedValue = this.cache.get(url)
    if (cachedValue !== undefined) {
      debug('Return from cache')
      process.nextTick(() => {
        cb(null, cachedValue)
      })
    } else {
      const req = this.request
        .get(url)
      if (this.proxy) req.proxy(this.proxy)
      req.buffer(true)
        .end((err, res) => {
          if (err) return cb(err)
          this.cache.set(url, res.text)
          cb(null, res.text)
        })
    }
  }

  __download (url, localPath, start, end, progressCb) {
    debug(`download bytes ${start}-${end} from ${url} to ${localPath}`)

    return new Promise((resolve, reject) => {
      const writable = fs.createWriteStream(localPath)
      const req = this.request.get(url)
        .buffer(false)
        .on('progress', progressCb)
        .on('error', reject)

      if (this.proxy) req.proxy(this.proxy)

      if (start !== undefined && end !== undefined) {
        debug(`Set Range header to bytes=${start}-${end}`)
        req.set('Range', `bytes=${start}-${end}`)
      }

      writable.on('close', () => resolve(writable.path))
      writable.on('error', (e) => reject(e))

      req.pipe(writable)
    })
  }

  __parseDate (strDate) {
    return new Date(Date.UTC(
      strDate.substr(0, 4),
      parseInt(strDate.substr(4, 2)) - 1,
      strDate.substr(6, 2),
      strDate.substr(8, 2)
    ))
  }

  __resolveFileName (generatedHour, fieldName, resolution, forecast) {
    const strGeneratedHour = padStart(generatedHour, 2, '0')

    if (pgrbVars.indexOf(fieldName) !== -1) {
      const strResolution = resolution.toFixed(2).replace('.', 'p')
      const strForecast = padStart(forecast, 3, '0')

      return `gfs.t${strGeneratedHour}z.pgrb2.${strResolution}.f${strForecast}`
    }

    if (sfluxVars.indexOf(fieldName) !== -1) {
      if (forecast === 0) forecast = 1 // file does not contain all required fields
      const strForecast = padStart(forecast, 3, '0')
      return `gfs.t${strGeneratedHour}z.sfluxgrbf${strForecast}.grib2`
    }

    throw new Error(`Unknown field ${fieldName}`)
  }
}

// from https://www.nco.ncep.noaa.gov/pmb/products/gfs/gfs.t00z.pgrb2.1p00.f000.shtml
const pgrbVars = [
  'UGRD', 'VGRD', 'VRATE', 'GUST', 'HGT', 'TMP', 'RH', 'O3MR', 'ABSV', 'VVEL',
  'CLWMR', 'HINDEX', 'MSLET', 'PRES', 'TSOIL', 'SOILW', 'WEASD', 'SNOD', 'SPFH',
  'DPT', 'var', 'CPOFP', 'WILT', 'FLDCP', 'LFTX', 'CAPE', 'CIN', '4LFTX',
  'PWAT', 'CWAT', 'TOZNE', 'HLCY', 'USTM', 'VSTM', 'ICAHT', 'VWSH',
  'HPBL', 'POT', 'PLPL', 'LAND', 'ICEC', 'PRMSL', '5WAVH'
]
// from https://www.nco.ncep.noaa.gov/pmb/products/gfs/gfs.t00z.sfluxgrbf00.grib2.shtml
const sfluxVars = [
  'UFLX', 'VFLX', 'SHTFL', 'LHTFL', 'TMP', 'SOILW', 'WEASD', 'ULWRF', 'USWRF',
  'DSWRF', 'TCDC', 'PRES', 'DLWRF', 'DUVB', 'CDUVB', 'VBDSF', 'VDDSF', 'NBDSF',
  'NDDSF', 'CSULF', 'CSUSF', 'CSDLF', 'CSDSF', 'ALBDO', 'PRATE', 'CPRAT',
  'GFLUX', 'LAND', 'ICEC', 'SPFH', 'TMAX', 'TMIN', 'QMAX', 'QMIN', 'WATR',
  'PEVPR', 'CWORK', 'HPBL', 'PWAT', 'ICETK', 'SOILL', 'SNOD', 'CNWAT', 'SFCR',
  'VEG', 'VGTYP', 'SOTYP', 'SLTYP', 'FRICV', 'HGT', 'CRAIN', 'SFEXC', 'ACOND',
  'SSRUN', 'EVBS', 'EVCW', 'TRANS', 'SBSNO', 'SNOWC', 'SOILM', 'SNOHF', 'WILT',
  'FLDCP', 'SUNSD', 'CPOFP'
]
