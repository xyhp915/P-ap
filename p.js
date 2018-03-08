/* eslint-disable no-extend-native,prefer-promise-reject-errors */
/**
 * a implementation of Promise/A+
 * @author charlie
 * @email xyhp915@gmail.com
 */

const STATE_PENDING = 'pap-pending'
const STATE_FULLFILLED = 'pap-fullfilled'
const STATE_REJECTED = 'pap-rejected'
const NOOP = () => {}
const NOOP_VALUE_THROUGH = (ref) => () => {
  if (ref && ref instanceof Promise) {
    return ref._value
  }

  throw new TypeError('value pass through must be with [[promise]] context')
}
const NOOP_ERROR_THROUGH = (ref) => () => {
  if (ref && ref instanceof Promise) {
    return Promise.reject(ref._value)
  }

  throw new TypeError('value pass through must be with [[promise]] context')
}

function isFunction (f) {
  return typeof f === 'function'
}

function isObject (o) {
  return o != null && (typeof o === 'object')
}

function makeSubscriber (onFullfilled, onRejected) {
  return {
    doResolve: (val) => nextTick(() => onFullfilled(val)), // async
    doReject: (err) => nextTick(() => onRejected(err))
  }
}

function makeFullfilledValuePromise (value) {
  const p = new Promise(NOOP)
  p._state = STATE_FULLFILLED
  p._value = value

  return p
}

function nextTick (cb) {
  if (process) {
    process.nextTick(cb)
  } else {
    setImmediate(cb)
  }
}

function isPromiseLike (p) {
  return p && isFunction(p.then)
}

function checkPromiseInstance (p) {
  if (p == null || p.constructor !== Promise) {
    throw new TypeError('object must be instanceof Promise .')
  }
}

function isIterable (obj) {
  // checks for null and undefined
  if (obj == null) {
    return false
  }
  return typeof obj[Symbol.iterator] === 'function'
}

function isArrayLike (obj) {
  return (
    Array.isArray(obj) ||
    (!!obj &&
      typeof obj === 'object' &&
      typeof (obj.length) === 'number' &&
      (obj.length === 0 ||
        (obj.length > 0 &&
          (obj.length - 1) in obj)
      )
    )
  )
}

function checkPromiseStateBlock (p) {
  if (p && p._state !== STATE_PENDING) {
    throw new Error('[[PromiseState]] was block .')
  }
}

function handleChainValue (chainValue, nextResolve, nextReject, prevPromise) {
  if (chainValue === prevPromise) {
    return nextReject(new TypeError('[[onFullfilled]] can not return the same promise object .'))
  } else if (chainValue instanceof Promise) {
    chainValue.then(nextResolve, nextReject)
  } else if (isObject(chainValue) || isFunction(chainValue)) {
    const then = chainValue.then

    if (isObject(chainValue) && !isFunction(then)) {
      return nextReject(new Error('[[thenable]] object must be with a [[then]] method .'))
    }

    if (!isFunction(then)) {
      return nextResolve(chainValue)
    }

    try {
      then.call(chainValue, nextResolve, nextReject)
    } catch (e) {
      return nextReject(e)
    }
  } else {
    nextResolve(chainValue)
  }
}

/**
 * @param executor {Function}
 * @constructor
 */
function Promise (executor) {
  if (this == null || !isObject(this)) throw new TypeError('Promise must be constructed with new operator .')
  if (!isFunction(executor)) throw new TypeError('executor must be Function type .')
  if (this.constructor !== Promise) throw new TypeError('Promise must be constructed with new operator .')
  if (this instanceof Promise && this._state != null) throw new TypeError('error promise constructed context')

  // members
  this._state = STATE_PENDING
  this._value = null
  this._subscribers = []

  const doFullfilled = (value) => {
    checkPromiseStateBlock(this)

    this._value = value

    // call subscribers
    this._subscribers.forEach((sub) => {
      sub.doResolve(value)
    })

    this._state = STATE_FULLFILLED
  }

  const doRejected = (error) => {
    checkPromiseInstance(this)

    this._value = error

    // call subscriber
    this._subscribers.forEach((sub) => {
      sub.doReject(error)
    })

    this._state = STATE_REJECTED
  }

  // sync call executor
  try {
    executor(doFullfilled, doRejected)
  } catch (e) {
    doRejected(e)
  }
}

// static members
const VALUE_PROMISE_NULL = makeFullfilledValuePromise(null)
const VALUE_PROMISE_TRUE = makeFullfilledValuePromise(true)
const VALUE_PROMISE_FALSE = makeFullfilledValuePromise(false)
const VALUE_PROMISE_ZERO = makeFullfilledValuePromise(0)
const VALUE_PROMISE_EMPTY_STRING = makeFullfilledValuePromise('')

Promise.resolve = function (value) {
  if (this == null || this !== Promise) {
    throw new TypeError('[[resolve]] must be call with Promise context .')
  }

  // @todo
  if (value instanceof Promise) {
    return value
  }

  if (value == null) return VALUE_PROMISE_NULL
  if (value === true) return VALUE_PROMISE_TRUE
  if (value === false) return VALUE_PROMISE_FALSE
  if (value === 0) return VALUE_PROMISE_ZERO
  if (value === '') return VALUE_PROMISE_EMPTY_STRING

  // check Thenable value
  if (isObject(value) || isFunction(value)) {
    try {
      if (isPromiseLike(value)) {
        return new Promise(value.then.bind(value))
      }
    } catch (e) {
      return new Promise((resolve, reject) => {
        reject(e)
      })
    }
  }

  return makeFullfilledValuePromise(value)
}
Promise.reject = function (value) {
  if (this == null || this !== Promise) {
    throw new TypeError('[[reject]] must be call with Promise context .')
  }

  return new Promise((resolve, reject) => {
    reject(value)
  })
}

Promise.race = function (iterator) {
  if (this == null || this !== Promise) {
    throw new TypeError('[[race]] must be call with Promise context .')
  }

  if (!isArrayLike(iterator) && !isIterable(iterator)) {
    return Promise.reject(new TypeError('[[race]] non-iterable argument .'))
  }

  iterator = Array.from(iterator)

  if (iterator.length === 0) {
    return new Promise(NOOP)
  }

  // let isSingle = iterator.length === 1
  let hadWon = false

  let done = NOOP
  let fail = NOOP

  let p = new Promise((resolve, reject) => {
    done = resolve
    fail = reject
  })

  iterator.some(function (item) {
    try {
      checkPromiseInstance(item)
    } catch (e) {
      fail(e)
      return true
    }

    item.then(function doneItem (value) {
      if (!hadWon) {
        hadWon = true
        done(value)
      }
    }, function failItem (error) {
      if (!hadWon) {
        hadWon = true
        fail(error)
      }
    })
  })

  return p
}
Promise.all = function (iterator) {
  const payloads = []

  if (this == null || this !== Promise) {
    throw new TypeError('[[all]] must be call with Promise context .')
  }

  if (!isArrayLike(iterator) && !isIterable(iterator)) {
    return Promise.reject(new TypeError('[[all]] parameter must be iterable .'))
  }

  iterator = Array.from(iterator)

  if (iterator.length === 0) {
    return makeFullfilledValuePromise(payloads)
  }

  let done = NOOP
  let fail = NOOP

  let p = new Promise((resolve, reject) => {
    done = resolve
    fail = reject
  })

  // let isSingle = iterator.length === 1
  let remains = iterator.length

  iterator.some(function (item, index) {
    try {
      checkPromiseInstance(item)
    } catch (e) {
      fail(e)
      return true
    }

    item.then(function doneItem (value) {
      --remains
      payloads[index] = value

      if (remains === 0) {
        done(payloads)
      }
    }, function failItem (error) {
      // once rejected . all done .
      fail(error)
    })
  })

  return p
}

/**
 * @param onFullfilled {Function}
 * @param onRejected {Function}
 * @return {Promise}
 */
Promise.prototype.then = function (onFullfilled, onRejected) {
  checkPromiseInstance(this)

  !isFunction(onFullfilled) && (onFullfilled = NOOP_VALUE_THROUGH(this))
  !isFunction(onRejected) && (onRejected = NOOP_ERROR_THROUGH(this))

// eslint-disable-next-line promise/param-names
  return new Promise((nextResolve, nextReject) => {
    // do chains @important@
    const _chainOnFullfilled = (value) => {
      // chain promise state depend on subscriber invoker state
      let chainValue

      try {
        chainValue = onFullfilled(value)
      } catch (e) {
        return nextReject(e)
      }

      // handle chain value
      handleChainValue(chainValue, nextResolve, nextReject, this)
    }

    const _chainOnRejected = (error) => {
      let chainValue

      try {
        chainValue = onRejected(error)
      } catch (e) {
        return nextReject(e)
      }

      // handle chain value
      handleChainValue(chainValue, nextResolve, nextReject, this)
    }

    // 0. check parent promise state
    if (this._state === STATE_FULLFILLED) {
      nextTick(() => _chainOnFullfilled(this._value))
    } else if (this._state === STATE_REJECTED) {
      nextTick(() => _chainOnRejected(this._value))
    } else {
      this._subscribers.push(makeSubscriber(_chainOnFullfilled, _chainOnRejected))
    }
  })
}
Promise.prototype.catch = function (onRejected) {
  return this.then(null, onRejected)
}
Promise.prototype.finally = function () {}

exports.Promise = Promise
