// const P = Promise
const P = require('./p.js').Promise
// const P = require('bluebird')
// const P = require('lie')

module.exports = {
  defineGlobalPromise: function (globalScope) {
    globalScope.Promise = P
    globalScope.assert = require('assert')

    return globalScope
  },

  removeGlobalPromise: function (globalScope) {
    delete globalScope.Promise
  }
}
