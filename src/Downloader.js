import fs from 'fs'
import path from 'path'
import padStart from 'lodash.padstart'
import debugFactory from 'debug'

import {Client} from '.'
import {sequence} from 'gfs-weather-utils'

const debug = debugFactory('gfs.downloader')

export default class Downloader {
  constructor (config) {
    this.fields = config.fields || []
    this.target = config.target
    this.fcStart = config.forecastStart || 0
    this.fcEnd = config.forecastEnd || this.fcStart

    if (!this.target || !this.__writable(this.target)) {
      throw new Error(this.target + ' is not writable')
    }

    this.client = config.client || new Client()
  }

  /**
   * Obtain the date of the last data set
   * @param {Date|String} [date] - if omitted now is used
   * @return {Date}
   */
  uploadtime (date) {
    date = date ? new Date(date) : new Date()
    // correct date by 4 hours (UTC timeshift for uploading at NOOA)
    let dateTicks = +date - 4 * 3600000
    date = new Date(dateTicks)
    date.setUTCMinutes(0)
    date.setUTCSeconds(0)
    date.setUTCMilliseconds(0)
    let hour = date.getUTCHours()
    if (hour > 18) {
      hour = 18
    } else if (hour > 12) {
      hour = 12
    } else if (hour > 6) {
      hour = 6
    } else {
      hour = 0
    }
    date.setUTCHours(hour)
    return date
  }

  /**
   * downloads update from server
   * @param {Date} [date] -
   * @param {Date} [lastKnowndate] -
   * @return {Promise}
   */
  update (date, lastKnowndate) {
    let promise

    if (date) {
      promise = Promise.resolve(date)
    } else {
      promise = this.client.getLatestUpdate()
    }

    return promise.then((date) => {
      debug(`Download forecasts starting at ${date}`)
      if (lastKnowndate && date <= lastKnowndate) {
        // there is nothing to do - do not download anything
        return Promise.resolve([null, date])
      }

      return this.__downloadFields(date)
      .then((files) => [files, date])
    })
  }

  __downloadFields (generatedDate) {
    let downloads = []
    let results = []

    for (let fc = this.fcStart; fc <= this.fcEnd; fc += 3) {
      this.fields.forEach((field) => {
        let dateStr = generatedDate.toJSON()
        let fcStr = padStart(fc, 3, '0')
        let localFileName = `${dateStr}-${field.name}-${field.surface}-${fcStr}`
          .replace(/[\W]/g, '-')
          .replace(/-{2,}/, '-')
        let localPath = path.join(this.target, localFileName)
        let forecastOffset = fc

        downloads.push(() => {
          return this.client.downloadField(
            generatedDate, forecastOffset, field, localPath
          )
          .then((result) => {
            results.push({
              ...result,
              forecast: forecastOffset
            })
          }) // this.client.downloadField
        }) // downloads.push()
      }) // this.fields.forEach()
    } // for (;;)

    return sequence(downloads).then(() => results)
  }

  __writable (file) {
    try {
      fs.accessSync(file)
      return true
    } catch (e) {
      return false
    }
  }
}
