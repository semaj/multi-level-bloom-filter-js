'use strict';
var mmh3 = require('murmur-hash').v3;
var MurmurHash3 = function(seed, data) {
  return mmh3.x86.hash32(data, seed);
}

/**
 * A Bloom Filter implemented as for use in Bitcoin Connection Bloom Filtering (BIP37) that
 * uses version 3 of the 32-bit Murmur hash function.
 *
 * @see https://github.com/bitcoin/bips/blob/master/bip-0037.mediawiki
 * @see https://github.com/bitcoin/bitcoin/blob/master/src/bloom.cpp
 *
 * @param {Object} data - The data object used to initialize the filter.
 * @param {Array} data.vData - The data of the bloom filter.
 * @param {Number} data.nHashFuncs - The number of hash functions.
 * @param {Number} data.level - A random value to seed the hash functions (corresponds to level in MLBF).
 * @param {Number} data.nFlag - A flag to determine how matched items are added to the filter.
 * @constructor
 */
function Filter(arg) {
  /* jshint maxcomplexity: 10 */
  if (typeof(arg) === 'object') {
    if (!arg.vData) {
      throw new TypeError('Data object should include filter data "vData"');
    }
    this.vData = new Buffer(arg.vData);
    if (!arg.nHashFuncs) {
      throw new TypeError('Data object should include number of hash functions "nHashFuncs"');
    }
    if (arg.nHashFuncs > Filter.MAX_HASH_FUNCS) {
      throw new TypeError('"nHashFuncs" exceeded max size "' + Filter.MAX_HASH_FUNCS + '"');
    }
    this.nHashFuncs = arg.nHashFuncs;
    this.fpRate = arg.fpRate;
    this.level = arg.level || 0;
    this.elements = arg.elements;
  } else {
    throw new TypeError('Unrecognized argument');
  }
}

Filter.prototype.toObject = function toObject() {
  return {
    vData: new Buffer(this.vData).toString("base64"),
    level: this.level,
    elements: this.elements,
    fpRate: this.fpRate,
    nHashFuncs: this.nHashFuncs
  };
};

Filter.create = function create(elements, falsePositiveRate, level) {
  var info = {};

  // The ideal size for a bloom filter with a given number of elements and false positive rate is:
  // * - nElements * log(fp rate) / ln(2)^2
  // See: https://github.com/bitcoin/bitcoin/blob/master/src/bloom.cpp
  var size = -1.0 / Filter.LN2SQUARED * elements * Math.log(falsePositiveRate);
  var filterSize = Math.floor(size / 8);
  info.vData = new Buffer(filterSize);
  info.vData.fill(0);

  // The ideal number of hash functions is:
  // filter size * ln(2) / number of elements
  // See: https://github.com/bitcoin/bitcoin/blob/master/src/bloom.cpp
  //console.log("length " + info.vData.length);
  //console.log("elements " + elements);
  var nHashFuncs = Math.ceil(info.vData.length * 8 / elements * Filter.LN2);
  if (nHashFuncs < 1) {
    nHashFuncs = 1;
  }
  if (isNaN(nHashFuncs)) {
    console.error(elements);
    throw new Error("nHashFuncs is NaN!");
  }
  if (isNaN(elements)) {
    throw new Error("elements is NaN!");
  }

  info.fpRate = falsePositiveRate;
  info.nHashFuncs = nHashFuncs;
  info.level = level;
  info.elements = elements;

  return new Filter(info);

};

Filter.prototype.hash = function hash(nHashNum, vDataToHash) {
  var h = MurmurHash3(((nHashNum * 0xFBA4C795) + (1000000000 * this.level)) & 0xFFFFFFFF, vDataToHash);
  return h % (this.vData.length * 8);
};

Filter.prototype.insert = function insert(data) {
  for (var i = 0; i < this.nHashFuncs; i++) {
    var index = this.hash(i, data);
    var position = (1 << (7 & index));
    this.vData[index >> 3] |= position;
  }
  return this;
};

/**
 * @param {Buffer} Data to check if exists in the filter
 * @returns {Boolean} If the data matches
 */
Filter.prototype.contains = function contains(data) {
  if (!this.vData.length) {
    return false;
  }
  for (var i = 0; i < this.nHashFuncs; i++) {
    var index = this.hash(i, data);
    if (!(this.vData[index >> 3] & (1 << (7 & index)))) {
      return false;
    }
  }
  return true;
};

Filter.prototype.clear = function clear() {
  this.vData = new Buffer(this.vData.length);
  this.vData.fill(0);
};

Filter.prototype.inspect = function inspect() {
  return '<BloomFilter:' +
    this.vData.toJSON().data + ' nHashFuncs:' +
    this.nHashFuncs + ' level:' +
    this.level + '>';
};

Filter.prototype.toJSON = function() {
  return JSON.stringify(this.toObject());
}

Filter.fromJSON = function(data) {
  console.log(data);
  data = JSON.parse(data);
  ['vData', 'level', 'elements',
   'fpRate', 'nHashFuncs'].forEach(function(a) {
    if (!data.hasOwnProperty(a)) {
      throw new TypeError("Filter JSON needs property: " + a);
    }
  });
  data.vData = Buffer.from(data.vData, 'base64');
  return new Filter(data);
}

Filter.BLOOM_UPDATE_NONE = 0;
Filter.BLOOM_UPDATE_ALL = 1;
Filter.BLOOM_UPDATE_P2PUBKEY_ONLY = 2;
Filter.MAX_HASH_FUNCS = 50;
Filter.MIN_HASH_FUNCS = 1;
Filter.LN2SQUARED = Math.pow(Math.log(2), 2); // 0.4804530139182014246671025263266649717305529515945455
Filter.LN2 = Math.log(2); // 0.6931471805599453094172321214581765680755001343602552

module.exports = Filter;
