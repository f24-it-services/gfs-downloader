'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _superagent = require('superagent');

var _superagent2 = _interopRequireDefault(_superagent);

var _nodeCache = require('node-cache');

var _nodeCache2 = _interopRequireDefault(_nodeCache);

var _lodash = require('lodash.max');

var _lodash2 = _interopRequireDefault(_lodash);

var _lodash3 = require('lodash.padstart');

var _lodash4 = _interopRequireDefault(_lodash3);

var _debug = require('debug');

var _debug2 = _interopRequireDefault(_debug);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var debug = (0, _debug2.default)('gfs.client');
var GFS_BASE_URL = 'http://www.ftp.ncep.noaa.gov/data/nccf/com/gfs/prod/';
var NOOP = function NOOP() {};

/**
 *
 */

var Client = function () {
  function Client() {
    var baseUrl = arguments.length <= 0 || arguments[0] === undefined ? GFS_BASE_URL : arguments[0];

    _classCallCheck(this, Client);

    this.baseUrl = baseUrl;
    this.cache = new _nodeCache2.default({
      stdTTL: 60
    });
  }

  /**
   * Returns the latest available forecast date
   * @return {object}
   */


  _createClass(Client, [{
    key: 'getLatestUpdate',
    value: function getLatestUpdate() {
      var _this = this;

      debug('Find latest folder on ' + this.baseUrl);

      return new Promise(function (resolve, reject) {
        _this.__get(function (err, res) {
          if (err) return reject(err);

          var dates = res.match(/gfs\.\d{10}/g);
          var max = (0, _lodash2.default)(dates.map(function (d) {
            return parseInt(d.substr(4));
          }));

          resolve(_this.__parseDate(max.toString()));
        });
      });
    }

    /**
     * Reads the grib inventory for a given grib file url
     * @param  {string} fileUrl
     * @return {object}
     */

  }, {
    key: 'getGribIndex',
    value: function getGribIndex(fileUrl) {
      var _this2 = this;

      return new Promise(function (resolve, reject) {
        _this2.__get(fileUrl + '.idx', function (err, res) {
          if (err) return reject(err);

          var index = [];
          var i = 0;

          res.split(/\n/).forEach(function (line) {
            var _line$split = line.split(/:/);

            var _line$split2 = _slicedToArray(_line$split, 5);

            var num = _line$split2[0];
            var start = _line$split2[1];
            var date = _line$split2[2];
            var name = _line$split2[3];
            var surface = _line$split2[4];

            if (start === undefined) return; // Skip empty lines

            num = parseInt(num);
            start = parseInt(start);
            date = _this2.__parseDate(date.substr(2));

            if (i > 0) {
              index[i - 1].end = start - 1;
            }

            index[i++] = {
              num: num, name: name, surface: surface, date: date, start: start, // eslint-disable-line
              end: undefined,
              url: _this2.baseUrl + fileUrl
            };
          });

          resolve(index);
        });
      });
    }

    /**
     * Downloads a field from grib2 file. The file and and part is matched based
     * on the date, the grib2 file was generated, the forecasted hour and field
     * name and surface as specified in grib2 indexes.
     * Returns a promise which is resolved with an object having the same props
     * as the `field` parameter, extended with the key `file`, containing the file
     * name the give `writeStream` was pointing to.
     *
     * @param {Date} generatedDate
     * @param {Number} forecastOffset
     * @param {Object} field
     * @param {Stream} writeStream
     * @param {Function} progressCb
     * @return {Promise}
     */

  }, {
    key: 'downloadField',
    value: function downloadField(generatedDate, forecastOffset, field, writeStream) {
      var _this3 = this;

      var progressCb = arguments.length <= 4 || arguments[4] === undefined ? NOOP : arguments[4];

      var y = generatedDate.getFullYear();
      var m = (0, _lodash4.default)(generatedDate.getMonth() + 1, 2, '0');
      var d = (0, _lodash4.default)(generatedDate.getDate(), 2, '0');
      var h = (0, _lodash4.default)(generatedDate.getUTCHours(), 2, '0');
      var gfsFileName = this.__resolveFileName(generatedDate.getUTCHours(), field.name, field.resolution, forecastOffset);
      var url = 'gfs.' + y + m + d + h + '/' + gfsFileName;

      return this.getGribIndex(url).then(function (index) {
        var entry = index.find(function (entry) {
          return entry.name === field.name && entry.surface === field.surface;
        });

        if (!entry) {
          return Promise.reject(new Error('Field ' + field.name + '@' + field.surface + ' not found at ' + url));
        }

        debug('download ' + field.name + '@' + field.surface + ' from ' + url);
        return _this3.__download(entry.url, writeStream, entry.start, entry.end, progressCb).then(function (path) {
          return _extends({}, field, {
            file: path
          });
        });
      });
    }
  }, {
    key: '__get',
    value: function __get() {
      var _this4 = this;

      var path = arguments.length <= 0 || arguments[0] === undefined ? '' : arguments[0];
      var cb = arguments[1];

      if (arguments.length === 1) {
        cb = path;
        path = '';
      }

      var url = this.baseUrl + path;
      debug('Fetch ' + url);

      var cachedValue = this.cache.get(url);
      if (cachedValue !== undefined) {
        debug('Return from cache');
        process.nextTick(function () {
          cb(null, cachedValue);
        });
      } else {
        _superagent2.default.get(url).buffer(true).end(function (err, res) {
          if (err) return cb(err);
          _this4.cache.set(url, res.text);
          cb(null, res.text);
        });
      }
    }
  }, {
    key: '__download',
    value: function __download(url, writable, start, end, progressCb) {
      debug('download bytes ' + start + '-' + end + ' from ' + url + ' to ' + writable.path);

      return new Promise(function (resolve, reject) {
        var req = _superagent2.default.get(url).buffer(false).on('progress', progressCb).on('error', reject);

        if (start !== undefined && end !== undefined) {
          debug('Set Range header to bytes=' + start + '-' + end);
          req.set('Range', 'bytes=' + start + '-' + end);
        }

        writable.on('close', function () {
          return resolve(writable.path);
        });
        writable.on('error', function (e) {
          return reject(e);
        });

        req.pipe(writable);
      });
    }
  }, {
    key: '__parseDate',
    value: function __parseDate(strDate) {
      return new Date(Date.UTC(strDate.substr(0, 4), parseInt(strDate.substr(4, 2)) - 1, strDate.substr(6, 2), strDate.substr(8, 2)));
    }
  }, {
    key: '__resolveFileName',
    value: function __resolveFileName(generatedHour, fieldName, resolution, forecast) {
      var strGeneratedHour = (0, _lodash4.default)(generatedHour, 2, '0');

      if (pgrbVars.indexOf(fieldName) !== -1) {
        var strResolution = resolution.toFixed(2).replace('.', 'p');
        var strForecast = (0, _lodash4.default)(forecast, 3, '0');

        return 'gfs.t' + strGeneratedHour + 'z.pgrb2.' + strResolution + '.f' + strForecast;
      }

      if (sfluxVars.indexOf(fieldName) !== -1) {
        var _strForecast = (0, _lodash4.default)(forecast, 2, '0');
        return 'gfs.t' + strGeneratedHour + 'z.sfluxgrbf' + _strForecast + '.grib2';
      }

      throw new Error('Unknown field ' + fieldName);
    }
  }]);

  return Client;
}();

exports.default = Client;


var pgrbVars = ['UGRD', 'VGRD', 'VRATE', 'GUST', 'HGT', 'TMP', 'RH', 'O3MR', 'ABSV', 'VVEL', 'CLWMR', 'HINDEX', 'MSLET', 'PRES', 'TSOIL', 'SOILW', 'WEASD', 'SNOD', 'SPFH', 'DPT', 'var', 'CPOFP', 'WILT', 'FLDCP', 'LFTX', 'CAPE', 'CIN', '4LFTX', 'PWAT', 'CWAT', 'TOZNE', 'HLCY', 'USTM', 'VSTM', 'ICAHT', 'VWSH', 'HPBL', 'POT', 'PLPL', 'LAND', 'ICEC', 'PRMSL', '5WAVH'];
var sfluxVars = ['UFLX', 'VFLX', 'SHTFL', 'LHTFL', 'TMP', 'SOILW', 'WEASD', 'ULWRF', 'USWRF', 'DSWRF', 'TCDC', 'PRES', 'DLWRF', 'DUVB', 'CDUVB', 'VBDSF', 'VDDSF', 'NBDSF', 'NDDSF', 'CSULF', 'CSUSF', 'CSDLF', 'CSDSF', 'ALBDO', 'PRATE', 'CPRAT', 'GFLUX', 'LAND', 'ICEC', 'SPFH', 'TMAX', 'TMIN', 'QMAX', 'QMIN', 'WATR', 'PEVPR', 'CWORK', 'HPBL', 'PWAT', 'ICETK', 'SOILL', 'SNOD', 'CNWAT', 'SFCR', 'VEG', 'VGTYP', 'SOTYP', 'SLTYP', 'FRICV', 'HGT', 'CRAIN', 'SFEXC', 'ACOND', 'SSRUN', 'EVBS', 'EVCW', 'TRANS', 'SBSNO', 'SNOWC', 'SOILM', 'SNOHF', 'WILT', 'FLDCP', 'SUNSD', 'CPOFP'];