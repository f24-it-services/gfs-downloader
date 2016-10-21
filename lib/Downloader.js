'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _lodash = require('lodash.padstart');

var _lodash2 = _interopRequireDefault(_lodash);

var _debug = require('debug');

var _debug2 = _interopRequireDefault(_debug);

var _ = require('.');

var _gfsWeatherUtils = require('gfs-weather-utils');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var debug = (0, _debug2.default)('gfs.downloader');

var Downloader = function () {
  function Downloader(config) {
    _classCallCheck(this, Downloader);

    this.fields = config.fields || [];
    this.target = config.target;
    this.fcStart = config.forecastStart || 0;
    this.fcEnd = config.forecastEnd || this.fcStart;

    if (!this.target || !this.__writable(this.target)) {
      throw new Error(this.target + ' is not writable');
    }

    this.client = config.client || new _.Client();
  }

  /**
   * Obtain the date of the last data set
   * @param {Date|String} [date] - if omitted now is used
   * @return {Date}
   */


  _createClass(Downloader, [{
    key: 'uploadtime',
    value: function uploadtime(date) {
      date = date ? new Date(date) : new Date();
      // correct date by 4 hours (UTC timeshift for uploading at NOOA)
      var dateTicks = +date - 4 * 3600000;
      date = new Date(dateTicks);
      date.setUTCMinutes(0);
      date.setUTCSeconds(0);
      date.setUTCMilliseconds(0);
      var hour = date.getUTCHours();
      if (hour > 18) {
        hour = 18;
      } else if (hour > 12) {
        hour = 12;
      } else if (hour > 6) {
        hour = 6;
      } else {
        hour = 0;
      }
      date.setUTCHours(hour);
      return date;
    }

    /**
     * downloads update from server
     * @param {Date} [date] -
     * @param {Date} [lastKnowndate] -
     * @return {Promise}
     */

  }, {
    key: 'update',
    value: function update(date, lastKnowndate) {
      var _this = this;

      var promise = void 0;

      if (date) {
        promise = Promise.resolve(date);
      } else {
        promise = this.client.getLatestUpdate();
      }

      return promise.then(function (date) {
        debug('Download forecasts starting at ' + date);
        if (lastKnowndate && date <= lastKnowndate) {
          // there is nothing to do - do not download anything
          return Promise.resolve([null, date]);
        }

        return _this.__downloadFields(date).then(function (files) {
          return [files, date];
        });
      });
    }
  }, {
    key: '__downloadFields',
    value: function __downloadFields(generatedDate) {
      var _this2 = this;

      var downloads = [];
      var results = [];

      var _loop = function _loop(fc) {
        _this2.fields.forEach(function (field) {
          var dateStr = generatedDate.toJSON();
          var fcStr = (0, _lodash2.default)(fc, 3, '0');
          var localFileName = (dateStr + '-' + field.name + '-' + field.surface + '-' + fcStr).replace(/[\W]/g, '-').replace(/-{2,}/, '-');
          var localPath = _path2.default.join(_this2.target, localFileName);
          var forecastOffset = fc;

          downloads.push(function () {
            return _this2.client.downloadField(generatedDate, forecastOffset, field, localPath).then(function (result) {
              results.push(_extends({}, result, {
                forecast: forecastOffset
              }));
            }); // this.client.downloadField
          }); // downloads.push()
        }); // this.fields.forEach()
      };

      for (var fc = this.fcStart; fc <= this.fcEnd; fc += 3) {
        _loop(fc);
      } // for (;;)

      return (0, _gfsWeatherUtils.sequence)(downloads).then(function () {
        return results;
      });
    }
  }, {
    key: '__writable',
    value: function __writable(file) {
      try {
        _fs2.default.accessSync(file);
        return true;
      } catch (e) {
        return false;
      }
    }
  }]);

  return Downloader;
}();

exports.default = Downloader;