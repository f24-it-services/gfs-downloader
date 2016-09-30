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
      throw new Error(this.target + 'is not writable')
    }

    this.client = config.client || new Client()
  }

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
        let writeStream = fs.createWriteStream(localPath)
        let forecastOffset = fc

        downloads.push(() => {
          return this.client.downloadField(
            generatedDate, forecastOffset, field, writeStream
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
